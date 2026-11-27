type InstallChoice = { outcome: "accepted" | "dismissed" };
export type InstallEvent = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<InstallChoice>;
};

export function createPwaInstall(
  events: EventTarget,
  displayMode: EventTarget & { readonly matches: boolean },
  iosStandalone = false,
) {
  let deferred: InstallEvent | null = null;
  let installedHere = false;
  let snapshot = {
    installed: displayMode.matches || iosStandalone,
    canPrompt: false,
    busy: false,
  };
  const subscribers = new Set<() => void>();
  const update = (changes: Partial<typeof snapshot>) => {
    snapshot = { ...snapshot, ...changes };
    subscribers.forEach((notify) => notify());
  };
  const available = (event: Event) => {
    if (snapshot.installed) return;
    event.preventDefault();
    deferred = event as InstallEvent;
    update({ canPrompt: true });
  };
  const installed = () => {
    installedHere = true;
    deferred = null;
    update({ installed: true, canPrompt: false });
  };
  const modeChanged = () => {
    const value = displayMode.matches || iosStandalone || installedHere;
    if (value) deferred = null;
    update({ installed: value, canPrompt: !!deferred });
  };
  events.addEventListener("beforeinstallprompt", available);
  events.addEventListener("appinstalled", installed);
  displayMode.addEventListener("change", modeChanged);
  return {
    getSnapshot: () => snapshot,
    subscribe(notify: () => void) {
      subscribers.add(notify);
      return () => { subscribers.delete(notify); };
    },
    async install(): Promise<InstallChoice["outcome"] | "unavailable"> {
      if (!deferred || snapshot.busy || snapshot.installed) return "unavailable";
      const event = deferred;
      deferred = null;
      update({ canPrompt: false, busy: true });
      try {
        // Invoke synchronously inside the click gesture; each event is single-use.
        await event.prompt();
        return (await event.userChoice).outcome;
      } finally {
        update({ busy: false });
      }
    },
    dispose() {
      events.removeEventListener("beforeinstallprompt", available);
      events.removeEventListener("appinstalled", installed);
      displayMode.removeEventListener("change", modeChanged);
      subscribers.clear();
    },
  };
}
