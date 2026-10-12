import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type {
  ILockingModule,
  MedusaContainer,
} from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import {
  financeExecutionWriterSchema,
  type FinanceExecutionWriter,
} from "../../modules/commerce-automation/service";
export { financeExecutionWriterSchema, type FinanceExecutionWriter };
export type FinanceExecutionScope = { groupId: string; cartId: string };

export function isStoppedFinanceWriter(
  candidate: FinanceExecutionWriter,
): boolean {
  const writer = financeExecutionWriterSchema.parse({
    execution_owner_id: candidate.execution_owner_id,
    execution_host: candidate.execution_host,
    execution_pid: candidate.execution_pid,
  });
  if (writer.execution_host !== hostname()) return false;
  try {
    process.kill(writer.execution_pid, 0);
  } catch (probe) {
    return (probe as NodeJS.ErrnoException).code === "ESRCH";
  }
  return false;
}

export async function releaseStoppedFinanceWriter(
  container: MedusaContainer,
  scope: FinanceExecutionScope,
  writer: FinanceExecutionWriter,
): Promise<boolean> {
  if (!isStoppedFinanceWriter(writer)) return false;
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  // A different/new writer is never displaced, even when an old process died.
  if (
    !(await locking.release(scope.cartId, {
      ownerId: writer.execution_owner_id,
    }))
  )
    return false;
  return true;
}

export async function withFinanceExecutionLock<T>(
  container: MedusaContainer,
  scope: FinanceExecutionScope,
  work: (ownerId: string) => Promise<T>,
  options?: {
    releaseStoppedWriter?: boolean;
    priorWriter?: FinanceExecutionWriter;
    stoppedOwnerId?: string;
  },
): Promise<T> {
  const locking = container.resolve<ILockingModule>(Modules.LOCKING);
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const ownerId = randomUUID();
  // Commit identity before acquiring the unexpiring lock, including writers that
  // never reach an operation/recovery claim after a crash or network interruption.
  const candidates = await journal.registerFinanceExecutionWriter({
    ...scope,
    writer: {
      execution_owner_id: ownerId,
      execution_host: hostname(),
      execution_pid: process.pid,
    },
  });
  let stoppedWriter: FinanceExecutionWriter | undefined;
  // A lease expiry is not evidence that an in-flight Stripe request stopped.
  // Crashed owners require explicit reconciliation; never take over by age.
  try {
    await locking.acquire(scope.cartId, { ownerId });
  } catch (error) {
    try {
      if (!options?.releaseStoppedWriter) throw error;
      const writers = [
        ...candidates,
        ...(options.priorWriter ? [options.priorWriter] : []),
      ];
      let released = false;
      for (const writer of writers) {
        if (writer.execution_owner_id === ownerId) continue;
        if (
          options.stoppedOwnerId &&
          writer.execution_owner_id !== options.stoppedOwnerId
        )
          continue;
        if (await releaseStoppedFinanceWriter(container, scope, writer)) {
          released = true;
          stoppedWriter = writer;
          break;
        }
      }
      if (!released) throw error;
      await locking.acquire(scope.cartId, { ownerId });
    } catch (acquisitionError) {
      // Redis's acknowledged contention means this owner never acquired the
      // lock. An IO failure can hide a successful acquisition: retain that
      // identity so the unexpiring lock remains recoverable after process exit.
      if (
        acquisitionError instanceof MedusaError &&
        acquisitionError.type === MedusaError.Types.CONFLICT
      ) {
        await journal.removeFinanceExecutionWriter({ ...scope, ownerId });
      }
      throw acquisitionError;
    }
  }
  try {
    const result = await work(ownerId);
    // Keep the prior identity available for the callback's audit and any orphan
    // fence reconciliation. A failed callback leaves it available for retry.
    if (stoppedWriter)
      await journal.removeFinanceExecutionWriter({
        ...scope,
        ownerId: stoppedWriter.execution_owner_id,
      });
    return result;
  } finally {
    const released = await locking.release(scope.cartId, { ownerId });
    if (!released)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "La exclusión financiera cambió; la compra requiere conciliación.",
      );
    await journal.removeFinanceExecutionWriter({ ...scope, ownerId });
  }
}
