import { S3FileService } from "@medusajs/file-s3/dist/services/s3-file";
import type { FileTypes, Logger, S3FileServiceOptions } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { validateCatalogImageContent } from "../../lib/catalog-media/validation";

const unsupported = (): never => { throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This storage provider accepts validated public product images only."); };

export class ProductMediaFileService extends S3FileService {
  static identifier = "product-media";

  constructor(container: { logger: Logger }, options: S3FileServiceOptions) {
    // Supabase public buckets ignore per-object ACL semantics: never rely on them for privacy.
    super(container, { ...options, acl: false, additional_client_config: { ...options.additional_client_config, forcePathStyle: true } });
  }

  override async upload(file: FileTypes.ProviderUploadFileDTO): Promise<FileTypes.ProviderFileResultDTO> {
    if (!file || file.access !== "public") unsupported();
    validateCatalogImageContent(file.content, file.mimeType);
    try { return await super.upload(file); }
    catch { throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Image storage is unavailable. Please retry the upload.", "catalog_image_storage_unavailable"); }
  }

  override async getUploadStream(): ReturnType<S3FileService["getUploadStream"]> {
    // Streaming would bypass the size/content check before a public object is written.
    return unsupported();
  }

  override async getPresignedUploadUrl(): Promise<FileTypes.ProviderFileResultDTO> {
    return unsupported();
  }
}
