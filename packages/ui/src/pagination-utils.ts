export const DEFAULT_TABLE_PAGE_SIZE = 10;

export function parseTableOffset(value: string | string[] | undefined) {
  const offset = typeof value === "string" ? Number(value) : 0;
  return Number.isSafeInteger(offset) && offset >= 0
    ? Math.floor(Math.min(offset, 1_000_000) / DEFAULT_TABLE_PAGE_SIZE) *
        DEFAULT_TABLE_PAGE_SIZE
    : 0;
}

export function tablePagination({
  count,
  offset,
  limit,
}: {
  count: number;
  offset: number;
  limit: number;
}) {
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const currentPage = Math.floor(offset / limit) + 1;
  const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];

  if (totalPages <= 7) {
    for (let page = 1; page <= totalPages; page++) pages.push(page);
  } else {
    const start = Math.max(2, Math.min(currentPage - 1, totalPages - 4));
    const end = Math.min(totalPages - 1, Math.max(currentPage + 1, 5));
    pages.push(1);
    if (start > 2) pages.push("ellipsis-start");
    for (let page = start; page <= end; page++) pages.push(page);
    if (end < totalPages - 1) pages.push("ellipsis-end");
    pages.push(totalPages);
  }

  return {
    currentPage,
    pages,
    previousOffset:
      offset > 0
        ? Math.min(Math.max(0, offset - limit), (totalPages - 1) * limit)
        : null,
    nextOffset: offset + limit < count ? offset + limit : null,
  };
}
