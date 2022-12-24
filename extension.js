const GLib = imports.gi.GLib;
const { byteArray, mainloop } = imports;
const { WindowClientType, WindowType } = imports.gi.Meta;

/* exported init */
function init() {
  return new Extension();
}

const MOTIF_HINTS_TITLE_BAR = "2, 0, 1, 0, 0";
const MOTIF_HINTS_NO_TITLE_BAR = "2, 0, 0, 0, 0";

class Extension {
  enable() {
    this._initialMotifHints = new Map();
    this._currentMotifHints = new Map();

    this._createdConnection = connectDebounced(
      global.display,
      "window-created",
      (window) => this._sync(window)
    );

    this._changedConnection = connectDebounced(
      global.window_manager,
      "size-changed",
      (actor) => {
        const window = actor.get_meta_window();

        if (!window) {
          return;
        }

        this._sync(window);
      }
    );

    forEachWindow((window) => {
      this._sync(window);
    });
  }

  disable() {
    this._createdConnection.disconnect();
    this._changedConnection.disconnect();

    forEachWindow((window) => {
      this._restore(window);
    });

    // Reset all state
    this._initialMotifHints = null;
    this._currentMotifHints = null;
    this._createdConnection = null;
    this._changedConnection = null;
  }

  _sync(window) {
    const xId = getXIdForWindow(window);

    if (!xId || this._getInitialMotifHints(xId) !== MOTIF_HINTS_TITLE_BAR) {
      return;
    }

    if (window.get_maximized()) {
      this._setMotifHints(xId, MOTIF_HINTS_NO_TITLE_BAR);
    } else {
      this._setMotifHints(xId, MOTIF_HINTS_TITLE_BAR);
    }
  }

  _restore(window) {
    const xId = getXIdForWindow(window);

    if (!xId) {
      return;
    }

    const initialMotifHints = this._initialMotifHints.get(xId);

    if (initialMotifHints) {
      this._setMotifHints(xId, initialMotifHints);
    }
  }

  _getInitialMotifHints(xId) {
    let initialMotifHints = this._initialMotifHints.get(xId);

    if (initialMotifHints === undefined) {
      initialMotifHints = this._getMotifHints(xId);
      this._initialMotifHints.set(xId, initialMotifHints);
    }

    return initialMotifHints;
  }

  _getMotifHints(xId) {
    let motifHints = this._currentMotifHints.get(xId);

    if (motifHints === undefined) {
      motifHints = getMotifHints(xId);
      this._currentMotifHints.set(xId, motifHints);
    }

    return motifHints;
  }

  _setMotifHints(xId, newMotifHints) {
    let currentMotifHints = this._currentMotifHints.get(xId);

    if (currentMotifHints === undefined) {
      log(`bug: setting _MOTIF_WM_HINTS of ${xId} before reading it`);
    }

    if (currentMotifHints !== newMotifHints) {
      this._currentMotifHints.set(xId, newMotifHints);
      setMotifHints(xId, newMotifHints);
    }
  }
}

function forEachWindow(callback) {
  for (const actor of global.get_window_actors()) {
    try {
      const window = actor.get_meta_window();

      if (!window) {
        return;
      }

      callback(window);
    } catch (error) {
      logError(error);
    }
  }
}

function connectDebounced(source, event, callback) {
  let isDisconnected = false;

  const id = source.connect(event, (_source, target) => {
    waitForIdleDebounced(target, () => {
      if (isDisconnected) {
        return;
      }

      callback(target);
    });
  });

  return {
    disconnect() {
      if (isDisconnected) {
        return;
      }

      source.disconnect(id);
      isDisconnected = true;
    },
  };
}

const debounceKeysWaitingForIdle = new WeakSet();

function waitForIdleDebounced(debounceKey, callback) {
  if (debounceKeysWaitingForIdle.has(debounceKey)) {
    return;
  }

  debounceKeysWaitingForIdle.add(debounceKey);

  waitForIdle(() => {
    if (!debounceKeysWaitingForIdle.delete(debounceKey)) {
      return;
    }

    callback();
  });
}

function waitForIdle(callback) {
  mainloop.idle_add(() => {
    try {
      callback();
    } catch (error) {
      logError(error);
    }

    // Always, always, always remove this function from the event loop!
    return false;
  });
}

const xIdCache = new WeakMap();

function getXIdForWindow(window) {
  let xId = xIdCache.get(window);

  if (xId === undefined) {
    xId = findXIdForWindow(window);
    xIdCache.set(window, xId);
  }

  return xId;
}

const XID_REGEXP = /0x[0-9a-f]+/;

function findXIdForWindow(window) {
  if (
    window.get_client_type() !== WindowClientType.X11 ||
    window.get_window_type() !== WindowType.NORMAL
  ) {
    return null;
  }

  const description = window.get_description();
  const match = description.match(XID_REGEXP);

  if (!match) {
    return null;
  }

  return match[0];
}

const MOTIF_HINTS_PROP = "_MOTIF_WM_HINTS";
const MOTIF_HINTS_FORMAT_ARGS = ["-f", MOTIF_HINTS_PROP, "32c"];

function getMotifHints(xId) {
  log(
    `expensive: reading _MOTIF_WM_HINTS for ${xId} (This should only happen once per window when it is created!)`
  );

  const command = [
    "xprop",
    "-id",
    xId,
    ...MOTIF_HINTS_FORMAT_ARGS,
    "-notype",
    MOTIF_HINTS_PROP,
  ];

  const [isOk, stdout, , exitCode] = GLib.spawn_sync(
    null, // inherit cwd
    command, // command to run
    null, // inherit env
    GLib.SpawnFlags.SEARCH_PATH, // search the path
    null // no setup func before `exec`
  );

  if (!isOk || exitCode !== 0) {
    return null;
  }

  const output = byteArray.toString(stdout);
  const [name, motifHints] = output.split(" = ", 2);

  // make sure that we got the correct property
  if (name !== MOTIF_HINTS_PROP) {
    return null;
  }

  return motifHints.trim();
}

function setMotifHints(xId, motifHints) {
  log(
    `expensive: updating _MOTIF_WM_HINTS of ${xId} (This should only happen once each time the window is maximized/restored!)`
  );

  const command = [
    "xprop",
    "-id",
    xId,
    ...MOTIF_HINTS_FORMAT_ARGS,
    "-set",
    MOTIF_HINTS_PROP,
    motifHints,
  ];

  GLib.spawn_async(
    null, // inherit cwd
    command, // command to run
    null, // inherit env
    GLib.SpawnFlags.SEARCH_PATH, // search the path
    null // no setup func before `exec`
  );
}
