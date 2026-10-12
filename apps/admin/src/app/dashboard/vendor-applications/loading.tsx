import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function LoadingVendorApplications() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Cargando solicitudes
      </p>
      <Table aria-hidden="true">
        <TableHeader>
          <TableRow>
            <TableHead>Tienda / solicitante</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Enviada (UTC)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-1 h-3 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-36" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Skeleton className="mt-5 h-4 w-16" />
    </div>
  );
}
