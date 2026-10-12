import type { Metadata } from "next";
import { Suspense } from "react";
import {
  CategoryBrowser,
  CategoryListSkeleton,
} from "@/features/categories/components/category-browser";
import { CreateCategoryForm } from "@/features/categories/components/create-category-form";

export const metadata: Metadata = {
  title: "Categorías",
  description:
    "Organiza las categorías del catálogo y gestiona su estructura en USAPEEK Admin.",
};

export default function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
      <CreateCategoryForm />
      <Suspense fallback={<CategoryListSkeleton showSearch />}>
        <CategoryBrowser searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
