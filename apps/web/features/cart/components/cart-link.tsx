import { getCart } from "../data"
import { CartIndicator } from "./cart-indicator"

async function readCartCountSnapshot() {
  const snapshotAt = Date.now()
  let count: number | null = null
  try {
    const cart = await getCart()
    count = cart?.items?.reduce((total, item) => total + item.quantity, 0) ?? 0
  } catch {
    /* Navigation stays available when the cart service is unavailable. */
  }
  return { initialCount: count, snapshotAt }
}

export async function CartLink() {
  const snapshot = await readCartCountSnapshot()
  return <CartIndicator {...snapshot} />
}
