/* eslint-disable */
// Visual smoke tool: drives the local dev server with headless Chrome and
// captures the main game flow into .screenshots/.
//
//   npm run dev            # in another terminal
//   npm run shot           # captures .screenshots/*.png
//   npm run shot -- --url http://localhost:3001
//   npm run shot -- --size 1366x768 --map 中国之旅
//
// Requires Google Chrome (CHROME_PATH overrides the default location).
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const CHROME =
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = argValue("--url", "http://localhost:3000");
const [width, height] = argValue("--size", "1600x900").split("x").map(Number);
const MAP_NAME = argValue("--map", "");
const OUT = path.resolve(__dirname, "..", ".screenshots");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const button = [...document.querySelectorAll("button")].find(
      (entry) => entry.textContent && entry.textContent.includes(needle) && !entry.disabled,
    );
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) console.log(`[skip] no enabled button matching: ${text}`);
  return clicked;
}

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME} (set CHROME_PATH).`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [`--window-size=${width},${height}`, "--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
    defaultViewport: { width, height, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log("pageerror:", error.message));

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, "01-menu.png") });

  await clickText(page, "单机人机");
  await sleep(700);
  if (MAP_NAME) {
    await clickText(page, MAP_NAME);
    await sleep(400);
  }
  await page.screenshot({ path: path.join(OUT, "02-setup.png") });

  await clickText(page, "开始对局");
  await sleep(3000);
  await page.screenshot({ path: path.join(OUT, "03-board.png") });

  await clickText(page, "掷骰子");
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, "04-rolling.png") });
  await sleep(2600);
  await page.screenshot({ path: path.join(OUT, "05-landed.png") });

  for (let index = 0; index < 40; index += 1) {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(
        (entry) =>
          entry.textContent &&
          (entry.textContent.includes("掷骰子") ||
            entry.textContent.includes("结束回合") ||
            entry.textContent.includes("购买") ||
            entry.textContent.includes("放弃")) &&
          !entry.disabled,
      );
      button?.click();
    });
    await sleep(1500);
    if (index === 8) await page.screenshot({ path: path.join(OUT, "06-midgame.png") });
    if (index === 24) await page.screenshot({ path: path.join(OUT, "07-lategame.png") });
  }
  await page.screenshot({ path: path.join(OUT, "08-final.png") });
  await browser.close();
  console.log(`screenshots written to ${OUT}`);
})();
