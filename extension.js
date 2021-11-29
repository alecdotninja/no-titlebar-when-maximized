const GLib = imports.gi.GLib;
const { byteArray, mainloop } = imports;
const { WindowClientType, WindowType } = imports.gi.Meta;

function init() {
  return new Extension();
}

const MOTIF_HINTS_TITLE_BAR = "2, 0, 1, 0, 0";
const MOTIF_HINTS_NO_TITLE_BAR = "2, 0, 0, 0, 0";

class Extension {
  enable() {
    this._trackedXIds = new WeakMap();

    this._createdConnection = connectDeferred(
      global.display,
      "window-created",
      (window) => this._sync(window)
    );

    this._changedConnection = connectDeferred(
      global.window_manager,
      "size-changed",
      (actor) => this._sync(actor.get_meta_window())
    );

    this._forEachWindow((window) => {
      this._sync(window);
    });
  }

  disable() {
    this._createdConnection.disconnect();
    this._changedConnection.disconnect();

    this._forEachWindow((window) => {
      this._restore(window);
    });

    // Reset all state
    this._trackedXIds = null;
    this._createdConnection = null;
    this._changedConnection = null;
  }

  _forEachWindow(callback) {
    for (const actor of global.get_window_actors()) {
      try {
        callback(actor.get_meta_window());
      } catch (error) {
        logError(error);
      }
    }
  }

  _sync(window) {
    const xId = this._trackedXId(window);

    if (!xId) {
      return;
    }

    if (window.get_maximized()) {
      setMotifHints(xId, MOTIF_HINTS_NO_TITLE_BAR);
    } else {
      setMotifHints(xId, MOTIF_HINTS_TITLE_BAR);
    }
  }

  _restore(window) {
    const xId = this._trackedXId(window, false);

    if (!xId) {
      return;
    }

    // This is the original state of the tracked window
    setMotifHints(xId, MOTIF_HINTS_TITLE_BAR);
  }

  _trackedXId(window, buildMissing = true) {
    let xId = this._trackedXIds.get(window);

    if (xId === undefined && buildMissing) {
      xId = this._buildTrackedXId(window);
      this._trackedXIds.set(window, xId);
    }

    return xId;
  }

  _buildTrackedXId(window) {
    if (
      window.get_client_type() !== WindowClientType.X11 ||
      window.get_window_type() !== WindowType.NORMAL
    ) {
      return null;
    }

    const xId = findXIdForWindow(window);

    if (!xId) {
      log(
        `Failed to find XId for window "${window.get_title()}" from X client`
      );
      return null;
    }

    // Only track windows which have a title bar
    if (getMotifHints(xId) !== MOTIF_HINTS_TITLE_BAR) {
      return null;
    }

    return xId;
  }
}

function connectDeferred(target, event, callback) {
  let isDisconnected = false;

  const id = target.connect(event, (_target, ...args) => {
    defer(() => {
      // Don't do anything if we were disconnected while waiting for idle
      if (isDisconnected) {
        return;
      }

      callback.call(target, ...args);
    });
  });

  return {
    disconnect() {
      if (isDisconnected) {
        return;
      }

      target.disconnect(id);
      isDisconnected = true;
    },
  };
}

function defer(callback) {
  mainloop.idle_add(() => {
    try {
      callback();
    } catch (error) {
      logError(error);
    }

    // Always remove from the event loop.
    return false;
  });
}

const XID_REGEXP = /0x[0-9a-f]+/;

function findXIdForWindow(window) {
  const description = window.get_description();
  const match = description.match(XID_REGEXP);
  return match && match[0];
}

const MOTIF_HINTS_PROP = "_MOTIF_WM_HINTS";
const MOTIF_HINTS_FORMAT_ARGS = ["-f", MOTIF_HINTS_PROP, "32c"];

function getMotifHints(xId) {
  const command = [
    "xprop",
    "-id",
    xId,
    ...MOTIF_HINTS_FORMAT_ARGS,
    "-notype",
    MOTIF_HINTS_PROP,
  ];

  const [isOk, stdout, _stderr, exitCode] = GLib.spawn_sync(
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

  if (!output) {
    return null;
  }

  const [name, motifHints] = output.split(" = ", 2);

  // make sure that we got the correct property
  if (name !== MOTIF_HINTS_PROP) {
    return null;
  }

  return motifHints.trim();
}

function setMotifHints(xId, motifHints) {
  const command = [
    "xprop",
    "-id",
    xId,
    ...MOTIF_HINTS_FORMAT_ARGS,
    "-set",
    MOTIF_HINTS_PROP,
    motifHints,
  ];

  GLib.spawn_sync(
    null, // inherit cwd
    command, // command to run
    null, // inherit env
    GLib.SpawnFlags.SEARCH_PATH, // search the path
    null // no setup func before `exec`
  );
}
