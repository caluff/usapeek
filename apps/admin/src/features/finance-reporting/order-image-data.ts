export type ReportOrderThumbnail = { src: string | null; alt: string };
export type ReportOrderImageData = Record<
  string,
  { images: ReportOrderThumbnail[]; additional: number }
>;
