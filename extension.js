import GLib from "gi://GLib";
const { byteArray, mainloop } = imports;
import Meta from "gi://Meta";

/* exported init */
function init() {
  return new Extension();
}

const MOTIF_HINTS_TITLE_BAR = "2, 0, 1, 0, 0";
const MOTIF_HINTS_NO_TITLE_BAR = "2, 0, 0, 0, 0";

export default class Extension {
  enable() {
    this._xWindows = new WeakMap();

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
    this._xWindows = null;
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
    if (!window) {
      log("possible bug: attempted to sync without window; ignoring for now");
      return;
    }

    const xWindow = this._xWindow(window);

    if (!xWindow) {
      return;
    }

    if (window.get_maximized()) {
      xWindow.setMotifHints(MOTIF_HINTS_NO_TITLE_BAR);
    } else {
      xWindow.setMotifHints(MOTIF_HINTS_TITLE_BAR);
    }
  }

  _restore(window) {
    if (!window) {
      log(
        "possible bug: attempted to restore without window; ignoring for now"
      );
      return;
    }

    const xWindow = this._xWindow(window, false);

    if (!xWindow) {
      return;
    }

    // This is the original state of the tracked window
    xWindow.setMotifHints(MOTIF_HINTS_TITLE_BAR);
  }

  _xWindow(window, buildMissing = true) {
    let xWindow = this._xWindows.get(window);

    if (xWindow === undefined && buildMissing) {
      xWindow = this._buildXWindow(window);
      this._xWindows.set(window, xWindow);
    }

    return xWindow;
  }

  _buildXWindow(window) {
    const xWindow = XWindow.forWindow(window);

    if (
      !xWindow ||
      // Only track windows which have a title bar
      xWindow.motifHints !== MOTIF_HINTS_TITLE_BAR
    ) {
      return null;
    }

    return xWindow;
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

class XWindow {
  static forWindow(window) {
    if (
      window.get_client_type() !== Meta.WindowClientType.X11 ||
      window.get_window_type() !== Meta.WindowType.NORMAL
    ) {
      return null;
    }

    const xId = findXIdForWindow(window);
    return xId && new XWindow(xId);
  }

  constructor(xId) {
    this.xId = xId;
    this._motifHints = getMotifHints(xId) || MOTIF_HINTS_TITLE_BAR;
  }

  get motifHints() {
    return this._motifHints;
  }

  setMotifHints(motifHints) {
    if (this._motifHints !== motifHints) {
      setMotifHints(this.xId, motifHints);
    }

    this._motifHints = motifHints;
  }
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

  GLib.spawn_async(
    null, // inherit cwd
    command, // command to run
    null, // inherit env
    GLib.SpawnFlags.SEARCH_PATH, // search the path
    null // no setup func before `exec`
  );
}
