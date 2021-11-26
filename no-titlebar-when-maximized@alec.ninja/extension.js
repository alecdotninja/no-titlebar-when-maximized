const GLib = imports.gi.GLib;
const { byteArray, mainloop } = imports;

function init() {
    return new Extension();
}

class Extension {
    constructor() {
        this._internals = null;
        
        this._createdListener = new Listener(
            global.display,
            'window-created',
            window => this._sync(window),
        );

        this._changedListener = new Listener(
            global.window_manager,
            'size-changed',
            actor => this._sync(actor.get_meta_window()),
        );
    }

    enable() {
        this._internals = new WeakMap();

        this._createdListener.enable();
        this._changedListener.enable();

        this._forEachWindow((window) => {
            this._sync(window);
        });
    }

    disable() {
        this._createdListener.disable();
        this._changedListener.disable();

        this._forEachWindow((window) => {
            this._restore(window);
        });

        this._internals = null;
    }

    _sync(window) {
        this._internal(window)?.sync();
    }

    _restore(window) {
        this._internal(window, false)?.restore();
    }

    _internal(window, buildMissing = true) {
        let internal = this._internals.get(window);

        if (!internal && buildMissing) {
            internal = this._buildInternal(window);
            this._internals.set(window, internal);
        }

        return internal;
    }

    _buildInternal(window) {
        const internal = new InternalWindow(window);

        // Only track windows which have a title bar
        if (!internal.titleBar) {
            return null;
        }

        return internal;
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
}

class InternalWindow {
    constructor(window) {
        this.window = window;
        this.xId = findXIdForWindow(window);
    }

    sync() {
        if (this.maximized) {
            this.titleBar = false;
        } else {
            this.titleBar = true;
        }
    }

    restore() {
        // We only track windows that had a title bar
        this.titleBar = true;
    }

    get title() {
        return this.window.get_title();
    }

    get maximized() {
        return this.window.get_maximized();
    }

    get titleBar() {
        const { xId } = this;
        return xId && getTitleBar(xId);
    }

    set titleBar(value) {
        const { xId } = this;

        if (!xId) {
            throw new Error(`The visibility of the title bar can only be changed for clients using Xorg`);
        }

        return setTitleBar(xId, value);
    }
}

class Listener {
    constructor(target, event, callback) {
        this.target = target;
        this.event = event;
        this.callback = callback;

        this._connection = null;
    }

    enable() {
        const { target, event, callback } = this;
        
        if (this._connection) {
            throw new Error(`Already connected to ${this.event}`);
        }

        let connection;
        
        const id = target.connect(event, (_target, ...args) => {
            defer(() => {
                // Make sure the callback is still valid to run.
                if (connection !== this._connection) {
                    return;
                }

                callback.call(target, ...args);
            });
        });

        connection = Object.freeze({
            target,
            id,
        });
        
        this._connection = connection;
    }

    disable() {
        if (!this._connection) {
            throw new Error(`Not connected to ${this.event}`);
        }

        const { target, id } = this._connection;
        target.disconnect(id);

        this._connection = null;
    }
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
    try {
        const description = window.get_description();
        const match = description.match(XID_REGEXP);
        return match && match[0];
    } catch (_) {
        return null;
    }
}

const DECOR_HINT_NONE = 0;
const DECOR_HINT_TITLE_BAR = 1;

function getTitleBar(xId) {
    const decorHint = getDecorHint(xId);
    return (decorHint === DECOR_HINT_TITLE_BAR);
}

function setTitleBar(xId, value) {
    if (value) {
        setDecorHint(xId, DECOR_HINT_TITLE_BAR);
    } else {
        setDecorHint(xId, DECOR_HINT_NONE);
    }
}

const DECOR_HINT_OFFSET = 2;

function getDecorHint(xId) {
    const wmHints = getHints(xId);
    return wmHints && wmHints[DECOR_HINT_OFFSET];
}

function setDecorHint(xId, value) {
    const wmHints = getHints(xId);

    if (!wmHints || wmHints[DECOR_HINT_OFFSET] === value) {
        return;
    }

    wmHints[DECOR_HINT_OFFSET] = value;
    setHints(xId, wmHints);
}


const HINTS_PROP = '_MOTIF_WM_HINTS';
const HINTS_TYPE = '32cccic';

const HINTS_FORMAT_ARGS = [
    '-f', HINTS_PROP, HINTS_TYPE,
];

function getHints(xId) {
    const output =
        runCommand(
            '-id', xId,
            ...HINTS_FORMAT_ARGS,
            '-notype',
            HINTS_PROP,
        );

    if (!output) {
        return null;
    }

    const [name, rawValue] = output.split(' = ', 2);

    // make sure that we got the correct property
    if (name !== HINTS_PROP) {
        return null;
    }

    const value = [];

    for (const rawPart of rawValue.split(', ')) {
        const part = Number(rawPart);

        // make sure we parsed the output correctly
        if (!Number.isSafeInteger(part)) {
            return null;
        }

        value.push(part);
    }

    return value;
}

function setHints(xid, value) {
    const rawValue = value.join(', ');

    runCommand(
        '-id', xid,
        ...HINTS_FORMAT_ARGS,
        '-set', HINTS_PROP, rawValue,
    );

    return true;
}

function runCommand(...args) {
    const [isOk, stdout, _stderr, exitCode] =
        GLib.spawn_sync(
            null,                           // inherit cwd
            ['xprop', ...args],             // command to run
            null,                           // inherit env
            GLib.SpawnFlags.SEARCH_PATH,    // search the path
            null,                           // no setup func before `exec`
        );

    if (isOk && exitCode === 0) {
        return byteArray.toString(stdout);
    } else {
        throw new Error(`xprop command failed: xprop ${args.join(' ')}`);
    }
}
