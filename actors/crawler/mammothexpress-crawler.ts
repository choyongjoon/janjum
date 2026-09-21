import { logger } from "../../shared/logger";
import { runMammothMenuCrawler } from "./mammothMenu";

// 매머드 익스프레스, the takeout brand on the 매머드커피 site
export const runMammothExpressCrawler = () =>
  runMammothMenuCrawler({
    slug: "mammothexpress",
    indexPath: "/sub/menu/list.html",
    listPath: "/sub/menu/list_sub.php",
  });

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMammothExpressCrawler().catch((error) => {
    logger.error("Mammoth Express crawler failed:", error);
    process.exit(1);
  });
}
