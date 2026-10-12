import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoadingProductReview() {
  return (
    <Card aria-busy="true">
      <CardHeader>
        <CardTitle>Cargando catálogo</CardTitle>
      </CardHeader>
      <CardContent>
        <p role="status" className="text-sm text-muted-foreground">
          Consultando productos y revisiones de Mercur…
        </p>
      </CardContent>
    </Card>
  );
}
