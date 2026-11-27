import { test } from "node:test";
import assert from "node:assert/strict";
import { createPwaInstall, type InstallEvent } from "../src/pwa-install.ts";

function setup(standalone = false) {
  const browser = new EventTarget();
  const display = Object.assign(new EventTarget(), { matches: standalone });
  const install = createPwaInstall(browser, display);
  return { browser, display, install };
}
function offer(browser: EventTarget, prompt: InstallEvent["prompt"], outcome: "accepted" | "dismissed" = "accepted") {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  browser.dispatchEvent(event);
  return event;
}

test("an install offer received before login survives late subscription and UI remounts", async () => {
  const { browser, install } = setup();
  let calls = 0;
  const event = offer(browser, async () => { calls++; });
  assert.equal(event.defaultPrevented, true);
  assert.equal(install.getSnapshot().canPrompt, true);
  const unsubscribe = install.subscribe(() => {});
  unsubscribe(); // Login/loading and React StrictMode can unmount a widget.
  const unsubscribeAgain = install.subscribe(() => {});
  const result = install.install();
  assert.equal(calls, 1, "prompt must run inside the original click gesture");
  assert.equal(await install.install(), "unavailable", "do not reuse a pending prompt");
  assert.equal(await result, "accepted");
  browser.dispatchEvent(new Event("appinstalled"));
  assert.equal(install.getSnapshot().installed, true);
  assert.equal(install.getSnapshot().canPrompt, false);
  unsubscribeAgain();
  install.dispose();
});

test("dismissal and failure consume their offer; a later browser offer enables retry", async () => {
  const { browser, install } = setup();
  assert.equal(await install.install(), "unavailable");
  offer(browser, async () => {}, "dismissed");
  assert.equal(await install.install(), "dismissed");
  assert.equal(install.getSnapshot().installed, false);
  assert.equal(await install.install(), "unavailable");
  offer(browser, async () => { throw new Error("Browser refused prompt"); });
  await assert.rejects(install.install(), /Browser refused/);
  assert.equal(install.getSnapshot().busy, false);
  assert.equal(install.getSnapshot().canPrompt, false);
  offer(browser, async () => {});
  assert.equal(await install.install(), "accepted");
  install.dispose();
});

test("standalone launch and display changes suppress installation controls", () => {
  const { browser, display, install } = setup(true);
  assert.equal(install.getSnapshot().installed, true);
  const event = offer(browser, async () => {});
  assert.equal(event.defaultPrevented, false);
  assert.equal(install.getSnapshot().canPrompt, false);
  display.matches = false;
  display.dispatchEvent(new Event("change"));
  assert.equal(install.getSnapshot().installed, false);
  display.matches = true;
  display.dispatchEvent(new Event("change"));
  assert.equal(install.getSnapshot().installed, true);
  install.dispose();
  const ios = createPwaInstall(new EventTarget(), Object.assign(new EventTarget(), { matches: false }), true);
  assert.equal(ios.getSnapshot().installed, true);
  ios.dispose();
});
