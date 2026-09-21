import { logger } from "../../shared/logger";
import { runMammothMenuCrawler } from "./mammothMenu";

// 매머드커피. 매머드 익스프레스 shares the site but is its own cafe
// (mammothexpress-crawler.ts).
export const runMammothCrawler = () =>
  runMammothMenuCrawler({
    slug: "mammoth",
    indexPath: "/sub/menu/list_coffee.php",
    listPath: "/sub/menu/list_coffee_sub.php",
  });

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMammothCrawler().catch((error) => {
    logger.error("Mammoth crawler failed:", error);
    process.exit(1);
  });
}
