import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import { ProductMediaFileService } from "./service";

export default ModuleProvider(Modules.FILE, { services: [ProductMediaFileService] });
