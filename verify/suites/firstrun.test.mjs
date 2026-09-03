import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/react/cjs/react.production.min.js
var require_react_production_min = __commonJS({
  "node_modules/react/cjs/react.production.min.js"(exports) {
    "use strict";
    var l = Symbol.for("react.element");
    var n2 = Symbol.for("react.portal");
    var p2 = Symbol.for("react.fragment");
    var q = Symbol.for("react.strict_mode");
    var r = Symbol.for("react.profiler");
    var t = Symbol.for("react.provider");
    var u = Symbol.for("react.context");
    var v = Symbol.for("react.forward_ref");
    var w = Symbol.for("react.suspense");
    var x = Symbol.for("react.memo");
    var y = Symbol.for("react.lazy");
    var z = Symbol.iterator;
    function A(a) {
      if (null === a || "object" !== typeof a) return null;
      a = z && a[z] || a["@@iterator"];
      return "function" === typeof a ? a : null;
    }
    var B = { isMounted: function() {
      return false;
    }, enqueueForceUpdate: function() {
    }, enqueueReplaceState: function() {
    }, enqueueSetState: function() {
    } };
    var C = Object.assign;
    var D = {};
    function E(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    E.prototype.isReactComponent = {};
    E.prototype.setState = function(a, b) {
      if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
      this.updater.enqueueSetState(this, a, b, "setState");
    };
    E.prototype.forceUpdate = function(a) {
      this.updater.enqueueForceUpdate(this, a, "forceUpdate");
    };
    function F() {
    }
    F.prototype = E.prototype;
    function G(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    var H = G.prototype = new F();
    H.constructor = G;
    C(H, E.prototype);
    H.isPureReactComponent = true;
    var I = Array.isArray;
    var J = Object.prototype.hasOwnProperty;
    var K = { current: null };
    var L = { key: true, ref: true, __self: true, __source: true };
    function M(a, b, e) {
      var d, c = {}, k = null, h = null;
      if (null != b) for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b) J.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
      var g2 = arguments.length - 2;
      if (1 === g2) c.children = e;
      else if (1 < g2) {
        for (var f = Array(g2), m = 0; m < g2; m++) f[m] = arguments[m + 2];
        c.children = f;
      }
      if (a && a.defaultProps) for (d in g2 = a.defaultProps, g2) void 0 === c[d] && (c[d] = g2[d]);
      return { $$typeof: l, type: a, key: k, ref: h, props: c, _owner: K.current };
    }
    function N(a, b) {
      return { $$typeof: l, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
    }
    function O(a) {
      return "object" === typeof a && null !== a && a.$$typeof === l;
    }
    function escape(a) {
      var b = { "=": "=0", ":": "=2" };
      return "$" + a.replace(/[=:]/g, function(a2) {
        return b[a2];
      });
    }
    var P = /\/+/g;
    function Q(a, b) {
      return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
    }
    function R(a, b, e, d, c) {
      var k = typeof a;
      if ("undefined" === k || "boolean" === k) a = null;
      var h = false;
      if (null === a) h = true;
      else switch (k) {
        case "string":
        case "number":
          h = true;
          break;
        case "object":
          switch (a.$$typeof) {
            case l:
            case n2:
              h = true;
          }
      }
      if (h) return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
        return a2;
      })) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
      h = 0;
      d = "" === d ? "." : d + ":";
      if (I(a)) for (var g2 = 0; g2 < a.length; g2++) {
        k = a[g2];
        var f = d + Q(k, g2);
        h += R(k, b, e, f, c);
      }
      else if (f = A(a), "function" === typeof f) for (a = f.call(a), g2 = 0; !(k = a.next()).done; ) k = k.value, f = d + Q(k, g2++), h += R(k, b, e, f, c);
      else if ("object" === k) throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
      return h;
    }
    function S(a, b, e) {
      if (null == a) return a;
      var d = [], c = 0;
      R(a, d, "", "", function(a2) {
        return b.call(e, a2, c++);
      });
      return d;
    }
    function T(a) {
      if (-1 === a._status) {
        var b = a._result;
        b = b();
        b.then(function(b2) {
          if (0 === a._status || -1 === a._status) a._status = 1, a._result = b2;
        }, function(b2) {
          if (0 === a._status || -1 === a._status) a._status = 2, a._result = b2;
        });
        -1 === a._status && (a._status = 0, a._result = b);
      }
      if (1 === a._status) return a._result.default;
      throw a._result;
    }
    var U = { current: null };
    var V = { transition: null };
    var W = { ReactCurrentDispatcher: U, ReactCurrentBatchConfig: V, ReactCurrentOwner: K };
    function X() {
      throw Error("act(...) is not supported in production builds of React.");
    }
    exports.Children = { map: S, forEach: function(a, b, e) {
      S(a, function() {
        b.apply(this, arguments);
      }, e);
    }, count: function(a) {
      var b = 0;
      S(a, function() {
        b++;
      });
      return b;
    }, toArray: function(a) {
      return S(a, function(a2) {
        return a2;
      }) || [];
    }, only: function(a) {
      if (!O(a)) throw Error("React.Children.only expected to receive a single React element child.");
      return a;
    } };
    exports.Component = E;
    exports.Fragment = p2;
    exports.Profiler = r;
    exports.PureComponent = G;
    exports.StrictMode = q;
    exports.Suspense = w;
    exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
    exports.act = X;
    exports.cloneElement = function(a, b, e) {
      if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
      var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
      if (null != b) {
        void 0 !== b.ref && (k = b.ref, h = K.current);
        void 0 !== b.key && (c = "" + b.key);
        if (a.type && a.type.defaultProps) var g2 = a.type.defaultProps;
        for (f in b) J.call(b, f) && !L.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g2 ? g2[f] : b[f]);
      }
      var f = arguments.length - 2;
      if (1 === f) d.children = e;
      else if (1 < f) {
        g2 = Array(f);
        for (var m = 0; m < f; m++) g2[m] = arguments[m + 2];
        d.children = g2;
      }
      return { $$typeof: l, type: a.type, key: c, ref: k, props: d, _owner: h };
    };
    exports.createContext = function(a) {
      a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
      a.Provider = { $$typeof: t, _context: a };
      return a.Consumer = a;
    };
    exports.createElement = M;
    exports.createFactory = function(a) {
      var b = M.bind(null, a);
      b.type = a;
      return b;
    };
    exports.createRef = function() {
      return { current: null };
    };
    exports.forwardRef = function(a) {
      return { $$typeof: v, render: a };
    };
    exports.isValidElement = O;
    exports.lazy = function(a) {
      return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T };
    };
    exports.memo = function(a, b) {
      return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
    };
    exports.startTransition = function(a) {
      var b = V.transition;
      V.transition = {};
      try {
        a();
      } finally {
        V.transition = b;
      }
    };
    exports.unstable_act = X;
    exports.useCallback = function(a, b) {
      return U.current.useCallback(a, b);
    };
    exports.useContext = function(a) {
      return U.current.useContext(a);
    };
    exports.useDebugValue = function() {
    };
    exports.useDeferredValue = function(a) {
      return U.current.useDeferredValue(a);
    };
    exports.useEffect = function(a, b) {
      return U.current.useEffect(a, b);
    };
    exports.useId = function() {
      return U.current.useId();
    };
    exports.useImperativeHandle = function(a, b, e) {
      return U.current.useImperativeHandle(a, b, e);
    };
    exports.useInsertionEffect = function(a, b) {
      return U.current.useInsertionEffect(a, b);
    };
    exports.useLayoutEffect = function(a, b) {
      return U.current.useLayoutEffect(a, b);
    };
    exports.useMemo = function(a, b) {
      return U.current.useMemo(a, b);
    };
    exports.useReducer = function(a, b, e) {
      return U.current.useReducer(a, b, e);
    };
    exports.useRef = function(a) {
      return U.current.useRef(a);
    };
    exports.useState = function(a) {
      return U.current.useState(a);
    };
    exports.useSyncExternalStore = function(a, b, e) {
      return U.current.useSyncExternalStore(a, b, e);
    };
    exports.useTransition = function() {
      return U.current.useTransition();
    };
    exports.version = "18.3.1";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports, module) {
    "use strict";
    if (process.env.NODE_ENV !== "production") {
      (function() {
        "use strict";
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
        }
        var ReactVersion = "18.3.1";
        var REACT_ELEMENT_TYPE = Symbol.for("react.element");
        var REACT_PORTAL_TYPE = Symbol.for("react.portal");
        var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
        var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
        var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
        var REACT_PROVIDER_TYPE = Symbol.for("react.provider");
        var REACT_CONTEXT_TYPE = Symbol.for("react.context");
        var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
        var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
        var REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list");
        var REACT_MEMO_TYPE = Symbol.for("react.memo");
        var REACT_LAZY_TYPE = Symbol.for("react.lazy");
        var REACT_OFFSCREEN_TYPE = Symbol.for("react.offscreen");
        var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
        var FAUX_ITERATOR_SYMBOL = "@@iterator";
        function getIteratorFn(maybeIterable) {
          if (maybeIterable === null || typeof maybeIterable !== "object") {
            return null;
          }
          var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
          if (typeof maybeIterator === "function") {
            return maybeIterator;
          }
          return null;
        }
        var ReactCurrentDispatcher = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactCurrentBatchConfig = {
          transition: null
        };
        var ReactCurrentActQueue = {
          current: null,
          // Used to reproduce behavior of `batchedUpdates` in legacy mode.
          isBatchingLegacy: false,
          didScheduleLegacyUpdate: false
        };
        var ReactCurrentOwner = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactDebugCurrentFrame = {};
        var currentExtraStackFrame = null;
        function setExtraStackFrame(stack) {
          {
            currentExtraStackFrame = stack;
          }
        }
        {
          ReactDebugCurrentFrame.setExtraStackFrame = function(stack) {
            {
              currentExtraStackFrame = stack;
            }
          };
          ReactDebugCurrentFrame.getCurrentStack = null;
          ReactDebugCurrentFrame.getStackAddendum = function() {
            var stack = "";
            if (currentExtraStackFrame) {
              stack += currentExtraStackFrame;
            }
            var impl = ReactDebugCurrentFrame.getCurrentStack;
            if (impl) {
              stack += impl() || "";
            }
            return stack;
          };
        }
        var enableScopeAPI = false;
        var enableCacheElement = false;
        var enableTransitionTracing = false;
        var enableLegacyHidden = false;
        var enableDebugTracing = false;
        var ReactSharedInternals = {
          ReactCurrentDispatcher,
          ReactCurrentBatchConfig,
          ReactCurrentOwner
        };
        {
          ReactSharedInternals.ReactDebugCurrentFrame = ReactDebugCurrentFrame;
          ReactSharedInternals.ReactCurrentActQueue = ReactCurrentActQueue;
        }
        function warn(format) {
          {
            {
              for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                args[_key - 1] = arguments[_key];
              }
              printWarning("warn", format, args);
            }
          }
        }
        function error(format) {
          {
            {
              for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
              }
              printWarning("error", format, args);
            }
          }
        }
        function printWarning(level, format, args) {
          {
            var ReactDebugCurrentFrame2 = ReactSharedInternals.ReactDebugCurrentFrame;
            var stack = ReactDebugCurrentFrame2.getStackAddendum();
            if (stack !== "") {
              format += "%s";
              args = args.concat([stack]);
            }
            var argsWithFormat = args.map(function(item) {
              return String(item);
            });
            argsWithFormat.unshift("Warning: " + format);
            Function.prototype.apply.call(console[level], console, argsWithFormat);
          }
        }
        var didWarnStateUpdateForUnmountedComponent = {};
        function warnNoop(publicInstance, callerName) {
          {
            var _constructor = publicInstance.constructor;
            var componentName = _constructor && (_constructor.displayName || _constructor.name) || "ReactClass";
            var warningKey = componentName + "." + callerName;
            if (didWarnStateUpdateForUnmountedComponent[warningKey]) {
              return;
            }
            error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, componentName);
            didWarnStateUpdateForUnmountedComponent[warningKey] = true;
          }
        }
        var ReactNoopUpdateQueue = {
          /**
           * Checks whether or not this composite component is mounted.
           * @param {ReactClass} publicInstance The instance we want to test.
           * @return {boolean} True if mounted, false otherwise.
           * @protected
           * @final
           */
          isMounted: function(publicInstance) {
            return false;
          },
          /**
           * Forces an update. This should only be invoked when it is known with
           * certainty that we are **not** in a DOM transaction.
           *
           * You may want to call this when you know that some deeper aspect of the
           * component's state has changed but `setState` was not called.
           *
           * This will not invoke `shouldComponentUpdate`, but it will invoke
           * `componentWillUpdate` and `componentDidUpdate`.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueForceUpdate: function(publicInstance, callback, callerName) {
            warnNoop(publicInstance, "forceUpdate");
          },
          /**
           * Replaces all of the state. Always use this or `setState` to mutate state.
           * You should treat `this.state` as immutable.
           *
           * There is no guarantee that `this.state` will be immediately updated, so
           * accessing `this.state` after calling this method may return the old value.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} completeState Next state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueReplaceState: function(publicInstance, completeState, callback, callerName) {
            warnNoop(publicInstance, "replaceState");
          },
          /**
           * Sets a subset of the state. This only exists because _pendingState is
           * internal. This provides a merging strategy that is not available to deep
           * properties which is confusing. TODO: Expose pendingState or don't use it
           * during the merge.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} partialState Next partial state to be merged with state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} Name of the calling function in the public API.
           * @internal
           */
          enqueueSetState: function(publicInstance, partialState, callback, callerName) {
            warnNoop(publicInstance, "setState");
          }
        };
        var assign = Object.assign;
        var emptyObject = {};
        {
          Object.freeze(emptyObject);
        }
        function Component(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        Component.prototype.isReactComponent = {};
        Component.prototype.setState = function(partialState, callback) {
          if (typeof partialState !== "object" && typeof partialState !== "function" && partialState != null) {
            throw new Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
          }
          this.updater.enqueueSetState(this, partialState, callback, "setState");
        };
        Component.prototype.forceUpdate = function(callback) {
          this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
        };
        {
          var deprecatedAPIs = {
            isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
            replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
          };
          var defineDeprecationWarning = function(methodName, info) {
            Object.defineProperty(Component.prototype, methodName, {
              get: function() {
                warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
                return void 0;
              }
            });
          };
          for (var fnName in deprecatedAPIs) {
            if (deprecatedAPIs.hasOwnProperty(fnName)) {
              defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
            }
          }
        }
        function ComponentDummy() {
        }
        ComponentDummy.prototype = Component.prototype;
        function PureComponent(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
        pureComponentPrototype.constructor = PureComponent;
        assign(pureComponentPrototype, Component.prototype);
        pureComponentPrototype.isPureReactComponent = true;
        function createRef() {
          var refObject = {
            current: null
          };
          {
            Object.seal(refObject);
          }
          return refObject;
        }
        var isArrayImpl = Array.isArray;
        function isArray(a) {
          return isArrayImpl(a);
        }
        function typeName(value) {
          {
            var hasToStringTag = typeof Symbol === "function" && Symbol.toStringTag;
            var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            return type;
          }
        }
        function willCoercionThrow(value) {
          {
            try {
              testStringCoercion(value);
              return false;
            } catch (e) {
              return true;
            }
          }
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          {
            if (willCoercionThrow(value)) {
              error("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", typeName(value));
              return testStringCoercion(value);
            }
          }
        }
        function getWrappedName(outerType, innerType, wrapperName) {
          var displayName = outerType.displayName;
          if (displayName) {
            return displayName;
          }
          var functionName = innerType.displayName || innerType.name || "";
          return functionName !== "" ? wrapperName + "(" + functionName + ")" : wrapperName;
        }
        function getContextName(type) {
          return type.displayName || "Context";
        }
        function getComponentNameFromType(type) {
          if (type == null) {
            return null;
          }
          {
            if (typeof type.tag === "number") {
              error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.");
            }
          }
          if (typeof type === "function") {
            return type.displayName || type.name || null;
          }
          if (typeof type === "string") {
            return type;
          }
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                var context = type;
                return getContextName(context) + ".Consumer";
              case REACT_PROVIDER_TYPE:
                var provider = type;
                return getContextName(provider._context) + ".Provider";
              case REACT_FORWARD_REF_TYPE:
                return getWrappedName(type, type.render, "ForwardRef");
              case REACT_MEMO_TYPE:
                var outerName = type.displayName || null;
                if (outerName !== null) {
                  return outerName;
                }
                return getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return getComponentNameFromType(init(payload));
                } catch (x) {
                  return null;
                }
              }
            }
          }
          return null;
        }
        var hasOwnProperty = Object.prototype.hasOwnProperty;
        var RESERVED_PROPS = {
          key: true,
          ref: true,
          __self: true,
          __source: true
        };
        var specialPropKeyWarningShown, specialPropRefWarningShown, didWarnAboutStringRefs;
        {
          didWarnAboutStringRefs = {};
        }
        function hasValidRef(config) {
          {
            if (hasOwnProperty.call(config, "ref")) {
              var getter = Object.getOwnPropertyDescriptor(config, "ref").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.ref !== void 0;
        }
        function hasValidKey(config) {
          {
            if (hasOwnProperty.call(config, "key")) {
              var getter = Object.getOwnPropertyDescriptor(config, "key").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.key !== void 0;
        }
        function defineKeyPropWarningGetter(props, displayName) {
          var warnAboutAccessingKey = function() {
            {
              if (!specialPropKeyWarningShown) {
                specialPropKeyWarningShown = true;
                error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingKey.isReactWarning = true;
          Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: true
          });
        }
        function defineRefPropWarningGetter(props, displayName) {
          var warnAboutAccessingRef = function() {
            {
              if (!specialPropRefWarningShown) {
                specialPropRefWarningShown = true;
                error("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingRef.isReactWarning = true;
          Object.defineProperty(props, "ref", {
            get: warnAboutAccessingRef,
            configurable: true
          });
        }
        function warnIfStringRefCannotBeAutoConverted(config) {
          {
            if (typeof config.ref === "string" && ReactCurrentOwner.current && config.__self && ReactCurrentOwner.current.stateNode !== config.__self) {
              var componentName = getComponentNameFromType(ReactCurrentOwner.current.type);
              if (!didWarnAboutStringRefs[componentName]) {
                error('Component "%s" contains the string ref "%s". Support for string refs will be removed in a future major release. This case cannot be automatically converted to an arrow function. We ask you to manually fix this case by using useRef() or createRef() instead. Learn more about using refs safely here: https://reactjs.org/link/strict-mode-string-ref', componentName, config.ref);
                didWarnAboutStringRefs[componentName] = true;
              }
            }
          }
        }
        var ReactElement = function(type, key, ref, self, source, owner, props) {
          var element = {
            // This tag allows us to uniquely identify this as a React Element
            $$typeof: REACT_ELEMENT_TYPE,
            // Built-in properties that belong on the element
            type,
            key,
            ref,
            props,
            // Record the component responsible for creating this element.
            _owner: owner
          };
          {
            element._store = {};
            Object.defineProperty(element._store, "validated", {
              configurable: false,
              enumerable: false,
              writable: true,
              value: false
            });
            Object.defineProperty(element, "_self", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: self
            });
            Object.defineProperty(element, "_source", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: source
            });
            if (Object.freeze) {
              Object.freeze(element.props);
              Object.freeze(element);
            }
          }
          return element;
        };
        function createElement(type, config, children) {
          var propName;
          var props = {};
          var key = null;
          var ref = null;
          var self = null;
          var source = null;
          if (config != null) {
            if (hasValidRef(config)) {
              ref = config.ref;
              {
                warnIfStringRefCannotBeAutoConverted(config);
              }
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            self = config.__self === void 0 ? null : config.__self;
            source = config.__source === void 0 ? null : config.__source;
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                props[propName] = config[propName];
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i = 0; i < childrenLength; i++) {
              childArray[i] = arguments[i + 2];
            }
            {
              if (Object.freeze) {
                Object.freeze(childArray);
              }
            }
            props.children = childArray;
          }
          if (type && type.defaultProps) {
            var defaultProps = type.defaultProps;
            for (propName in defaultProps) {
              if (props[propName] === void 0) {
                props[propName] = defaultProps[propName];
              }
            }
          }
          {
            if (key || ref) {
              var displayName = typeof type === "function" ? type.displayName || type.name || "Unknown" : type;
              if (key) {
                defineKeyPropWarningGetter(props, displayName);
              }
              if (ref) {
                defineRefPropWarningGetter(props, displayName);
              }
            }
          }
          return ReactElement(type, key, ref, self, source, ReactCurrentOwner.current, props);
        }
        function cloneAndReplaceKey(oldElement, newKey) {
          var newElement = ReactElement(oldElement.type, newKey, oldElement.ref, oldElement._self, oldElement._source, oldElement._owner, oldElement.props);
          return newElement;
        }
        function cloneElement(element, config, children) {
          if (element === null || element === void 0) {
            throw new Error("React.cloneElement(...): The argument must be a React element, but you passed " + element + ".");
          }
          var propName;
          var props = assign({}, element.props);
          var key = element.key;
          var ref = element.ref;
          var self = element._self;
          var source = element._source;
          var owner = element._owner;
          if (config != null) {
            if (hasValidRef(config)) {
              ref = config.ref;
              owner = ReactCurrentOwner.current;
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            var defaultProps;
            if (element.type && element.type.defaultProps) {
              defaultProps = element.type.defaultProps;
            }
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                if (config[propName] === void 0 && defaultProps !== void 0) {
                  props[propName] = defaultProps[propName];
                } else {
                  props[propName] = config[propName];
                }
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i = 0; i < childrenLength; i++) {
              childArray[i] = arguments[i + 2];
            }
            props.children = childArray;
          }
          return ReactElement(element.type, key, ref, self, source, owner, props);
        }
        function isValidElement(object) {
          return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        var SEPARATOR = ".";
        var SUBSEPARATOR = ":";
        function escape(key) {
          var escapeRegex = /[=:]/g;
          var escaperLookup = {
            "=": "=0",
            ":": "=2"
          };
          var escapedString = key.replace(escapeRegex, function(match) {
            return escaperLookup[match];
          });
          return "$" + escapedString;
        }
        var didWarnAboutMaps = false;
        var userProvidedKeyEscapeRegex = /\/+/g;
        function escapeUserProvidedKey(text) {
          return text.replace(userProvidedKeyEscapeRegex, "$&/");
        }
        function getElementKey(element, index) {
          if (typeof element === "object" && element !== null && element.key != null) {
            {
              checkKeyStringCoercion(element.key);
            }
            return escape("" + element.key);
          }
          return index.toString(36);
        }
        function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
          var type = typeof children;
          if (type === "undefined" || type === "boolean") {
            children = null;
          }
          var invokeCallback = false;
          if (children === null) {
            invokeCallback = true;
          } else {
            switch (type) {
              case "string":
              case "number":
                invokeCallback = true;
                break;
              case "object":
                switch (children.$$typeof) {
                  case REACT_ELEMENT_TYPE:
                  case REACT_PORTAL_TYPE:
                    invokeCallback = true;
                }
            }
          }
          if (invokeCallback) {
            var _child = children;
            var mappedChild = callback(_child);
            var childKey = nameSoFar === "" ? SEPARATOR + getElementKey(_child, 0) : nameSoFar;
            if (isArray(mappedChild)) {
              var escapedChildKey = "";
              if (childKey != null) {
                escapedChildKey = escapeUserProvidedKey(childKey) + "/";
              }
              mapIntoArray(mappedChild, array, escapedChildKey, "", function(c) {
                return c;
              });
            } else if (mappedChild != null) {
              if (isValidElement(mappedChild)) {
                {
                  if (mappedChild.key && (!_child || _child.key !== mappedChild.key)) {
                    checkKeyStringCoercion(mappedChild.key);
                  }
                }
                mappedChild = cloneAndReplaceKey(
                  mappedChild,
                  // Keep both the (mapped) and old keys if they differ, just as
                  // traverseAllChildren used to do for objects as children
                  escapedPrefix + // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
                  (mappedChild.key && (!_child || _child.key !== mappedChild.key) ? (
                    // $FlowFixMe Flow incorrectly thinks existing element's key can be a number
                    // eslint-disable-next-line react-internal/safe-string-coercion
                    escapeUserProvidedKey("" + mappedChild.key) + "/"
                  ) : "") + childKey
                );
              }
              array.push(mappedChild);
            }
            return 1;
          }
          var child;
          var nextName;
          var subtreeCount = 0;
          var nextNamePrefix = nameSoFar === "" ? SEPARATOR : nameSoFar + SUBSEPARATOR;
          if (isArray(children)) {
            for (var i = 0; i < children.length; i++) {
              child = children[i];
              nextName = nextNamePrefix + getElementKey(child, i);
              subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
            }
          } else {
            var iteratorFn = getIteratorFn(children);
            if (typeof iteratorFn === "function") {
              var iterableChildren = children;
              {
                if (iteratorFn === iterableChildren.entries) {
                  if (!didWarnAboutMaps) {
                    warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead.");
                  }
                  didWarnAboutMaps = true;
                }
              }
              var iterator = iteratorFn.call(iterableChildren);
              var step;
              var ii = 0;
              while (!(step = iterator.next()).done) {
                child = step.value;
                nextName = nextNamePrefix + getElementKey(child, ii++);
                subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
              }
            } else if (type === "object") {
              var childrenString = String(children);
              throw new Error("Objects are not valid as a React child (found: " + (childrenString === "[object Object]" ? "object with keys {" + Object.keys(children).join(", ") + "}" : childrenString) + "). If you meant to render a collection of children, use an array instead.");
            }
          }
          return subtreeCount;
        }
        function mapChildren(children, func, context) {
          if (children == null) {
            return children;
          }
          var result = [];
          var count = 0;
          mapIntoArray(children, result, "", "", function(child) {
            return func.call(context, child, count++);
          });
          return result;
        }
        function countChildren(children) {
          var n2 = 0;
          mapChildren(children, function() {
            n2++;
          });
          return n2;
        }
        function forEachChildren(children, forEachFunc, forEachContext) {
          mapChildren(children, function() {
            forEachFunc.apply(this, arguments);
          }, forEachContext);
        }
        function toArray(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        }
        function onlyChild(children) {
          if (!isValidElement(children)) {
            throw new Error("React.Children.only expected to receive a single React element child.");
          }
          return children;
        }
        function createContext(defaultValue) {
          var context = {
            $$typeof: REACT_CONTEXT_TYPE,
            // As a workaround to support multiple concurrent renderers, we categorize
            // some renderers as primary and others as secondary. We only expect
            // there to be two concurrent renderers at most: React Native (primary) and
            // Fabric (secondary); React DOM (primary) and React ART (secondary).
            // Secondary renderers store their context values on separate fields.
            _currentValue: defaultValue,
            _currentValue2: defaultValue,
            // Used to track how many concurrent renderers this context currently
            // supports within in a single renderer. Such as parallel server rendering.
            _threadCount: 0,
            // These are circular
            Provider: null,
            Consumer: null,
            // Add these to use same hidden class in VM as ServerContext
            _defaultValue: null,
            _globalName: null
          };
          context.Provider = {
            $$typeof: REACT_PROVIDER_TYPE,
            _context: context
          };
          var hasWarnedAboutUsingNestedContextConsumers = false;
          var hasWarnedAboutUsingConsumerProvider = false;
          var hasWarnedAboutDisplayNameOnConsumer = false;
          {
            var Consumer = {
              $$typeof: REACT_CONTEXT_TYPE,
              _context: context
            };
            Object.defineProperties(Consumer, {
              Provider: {
                get: function() {
                  if (!hasWarnedAboutUsingConsumerProvider) {
                    hasWarnedAboutUsingConsumerProvider = true;
                    error("Rendering <Context.Consumer.Provider> is not supported and will be removed in a future major release. Did you mean to render <Context.Provider> instead?");
                  }
                  return context.Provider;
                },
                set: function(_Provider) {
                  context.Provider = _Provider;
                }
              },
              _currentValue: {
                get: function() {
                  return context._currentValue;
                },
                set: function(_currentValue) {
                  context._currentValue = _currentValue;
                }
              },
              _currentValue2: {
                get: function() {
                  return context._currentValue2;
                },
                set: function(_currentValue2) {
                  context._currentValue2 = _currentValue2;
                }
              },
              _threadCount: {
                get: function() {
                  return context._threadCount;
                },
                set: function(_threadCount) {
                  context._threadCount = _threadCount;
                }
              },
              Consumer: {
                get: function() {
                  if (!hasWarnedAboutUsingNestedContextConsumers) {
                    hasWarnedAboutUsingNestedContextConsumers = true;
                    error("Rendering <Context.Consumer.Consumer> is not supported and will be removed in a future major release. Did you mean to render <Context.Consumer> instead?");
                  }
                  return context.Consumer;
                }
              },
              displayName: {
                get: function() {
                  return context.displayName;
                },
                set: function(displayName) {
                  if (!hasWarnedAboutDisplayNameOnConsumer) {
                    warn("Setting `displayName` on Context.Consumer has no effect. You should set it directly on the context with Context.displayName = '%s'.", displayName);
                    hasWarnedAboutDisplayNameOnConsumer = true;
                  }
                }
              }
            });
            context.Consumer = Consumer;
          }
          {
            context._currentRenderer = null;
            context._currentRenderer2 = null;
          }
          return context;
        }
        var Uninitialized = -1;
        var Pending = 0;
        var Resolved = 1;
        var Rejected = 2;
        function lazyInitializer(payload) {
          if (payload._status === Uninitialized) {
            var ctor = payload._result;
            var thenable = ctor();
            thenable.then(function(moduleObject2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var resolved = payload;
                resolved._status = Resolved;
                resolved._result = moduleObject2;
              }
            }, function(error2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var rejected = payload;
                rejected._status = Rejected;
                rejected._result = error2;
              }
            });
            if (payload._status === Uninitialized) {
              var pending = payload;
              pending._status = Pending;
              pending._result = thenable;
            }
          }
          if (payload._status === Resolved) {
            var moduleObject = payload._result;
            {
              if (moduleObject === void 0) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", moduleObject);
              }
            }
            {
              if (!("default" in moduleObject)) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", moduleObject);
              }
            }
            return moduleObject.default;
          } else {
            throw payload._result;
          }
        }
        function lazy(ctor) {
          var payload = {
            // We use these fields to store the result.
            _status: Uninitialized,
            _result: ctor
          };
          var lazyType = {
            $$typeof: REACT_LAZY_TYPE,
            _payload: payload,
            _init: lazyInitializer
          };
          {
            var defaultProps;
            var propTypes;
            Object.defineProperties(lazyType, {
              defaultProps: {
                configurable: true,
                get: function() {
                  return defaultProps;
                },
                set: function(newDefaultProps) {
                  error("React.lazy(...): It is not supported to assign `defaultProps` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  defaultProps = newDefaultProps;
                  Object.defineProperty(lazyType, "defaultProps", {
                    enumerable: true
                  });
                }
              },
              propTypes: {
                configurable: true,
                get: function() {
                  return propTypes;
                },
                set: function(newPropTypes) {
                  error("React.lazy(...): It is not supported to assign `propTypes` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  propTypes = newPropTypes;
                  Object.defineProperty(lazyType, "propTypes", {
                    enumerable: true
                  });
                }
              }
            });
          }
          return lazyType;
        }
        function forwardRef(render) {
          {
            if (render != null && render.$$typeof === REACT_MEMO_TYPE) {
              error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).");
            } else if (typeof render !== "function") {
              error("forwardRef requires a render function but was given %s.", render === null ? "null" : typeof render);
            } else {
              if (render.length !== 0 && render.length !== 2) {
                error("forwardRef render functions accept exactly two parameters: props and ref. %s", render.length === 1 ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
              }
            }
            if (render != null) {
              if (render.defaultProps != null || render.propTypes != null) {
                error("forwardRef render functions do not support propTypes or defaultProps. Did you accidentally pass a React component?");
              }
            }
          }
          var elementType = {
            $$typeof: REACT_FORWARD_REF_TYPE,
            render
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!render.name && !render.displayName) {
                  render.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        var REACT_MODULE_REFERENCE;
        {
          REACT_MODULE_REFERENCE = Symbol.for("react.module.reference");
        }
        function isValidElementType(type) {
          if (typeof type === "string" || typeof type === "function") {
            return true;
          }
          if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden || type === REACT_OFFSCREEN_TYPE || enableScopeAPI || enableCacheElement || enableTransitionTracing) {
            return true;
          }
          if (typeof type === "object" && type !== null) {
            if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
            // types supported by any Flight configuration anywhere since
            // we don't know which Flight build this will end up being used
            // with.
            type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== void 0) {
              return true;
            }
          }
          return false;
        }
        function memo(type, compare) {
          {
            if (!isValidElementType(type)) {
              error("memo: The first argument must be a component. Instead received: %s", type === null ? "null" : typeof type);
            }
          }
          var elementType = {
            $$typeof: REACT_MEMO_TYPE,
            type,
            compare: compare === void 0 ? null : compare
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!type.name && !type.displayName) {
                  type.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        function resolveDispatcher() {
          var dispatcher = ReactCurrentDispatcher.current;
          {
            if (dispatcher === null) {
              error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://reactjs.org/link/invalid-hook-call for tips about how to debug and fix this problem.");
            }
          }
          return dispatcher;
        }
        function useContext(Context) {
          var dispatcher = resolveDispatcher();
          {
            if (Context._context !== void 0) {
              var realContext = Context._context;
              if (realContext.Consumer === Context) {
                error("Calling useContext(Context.Consumer) is not supported, may cause bugs, and will be removed in a future major release. Did you mean to call useContext(Context) instead?");
              } else if (realContext.Provider === Context) {
                error("Calling useContext(Context.Provider) is not supported. Did you mean to call useContext(Context) instead?");
              }
            }
          }
          return dispatcher.useContext(Context);
        }
        function useState(initialState) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useState(initialState);
        }
        function useReducer(reducer, initialArg, init) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useReducer(reducer, initialArg, init);
        }
        function useRef(initialValue) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useRef(initialValue);
        }
        function useEffect(create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useEffect(create2, deps);
        }
        function useInsertionEffect(create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useInsertionEffect(create2, deps);
        }
        function useLayoutEffect(create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useLayoutEffect(create2, deps);
        }
        function useCallback(callback, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useCallback(callback, deps);
        }
        function useMemo(create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useMemo(create2, deps);
        }
        function useImperativeHandle(ref, create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useImperativeHandle(ref, create2, deps);
        }
        function useDebugValue(value, formatterFn) {
          {
            var dispatcher = resolveDispatcher();
            return dispatcher.useDebugValue(value, formatterFn);
          }
        }
        function useTransition() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useTransition();
        }
        function useDeferredValue(value) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useDeferredValue(value);
        }
        function useId() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useId();
        }
        function useSyncExternalStore2(subscribe, getSnapshot, getServerSnapshot) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
        }
        var disabledDepth = 0;
        var prevLog;
        var prevInfo;
        var prevWarn;
        var prevError;
        var prevGroup;
        var prevGroupCollapsed;
        var prevGroupEnd;
        function disabledLog() {
        }
        disabledLog.__reactDisabledLog = true;
        function disableLogs() {
          {
            if (disabledDepth === 0) {
              prevLog = console.log;
              prevInfo = console.info;
              prevWarn = console.warn;
              prevError = console.error;
              prevGroup = console.group;
              prevGroupCollapsed = console.groupCollapsed;
              prevGroupEnd = console.groupEnd;
              var props = {
                configurable: true,
                enumerable: true,
                value: disabledLog,
                writable: true
              };
              Object.defineProperties(console, {
                info: props,
                log: props,
                warn: props,
                error: props,
                group: props,
                groupCollapsed: props,
                groupEnd: props
              });
            }
            disabledDepth++;
          }
        }
        function reenableLogs() {
          {
            disabledDepth--;
            if (disabledDepth === 0) {
              var props = {
                configurable: true,
                enumerable: true,
                writable: true
              };
              Object.defineProperties(console, {
                log: assign({}, props, {
                  value: prevLog
                }),
                info: assign({}, props, {
                  value: prevInfo
                }),
                warn: assign({}, props, {
                  value: prevWarn
                }),
                error: assign({}, props, {
                  value: prevError
                }),
                group: assign({}, props, {
                  value: prevGroup
                }),
                groupCollapsed: assign({}, props, {
                  value: prevGroupCollapsed
                }),
                groupEnd: assign({}, props, {
                  value: prevGroupEnd
                })
              });
            }
            if (disabledDepth < 0) {
              error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
            }
          }
        }
        var ReactCurrentDispatcher$1 = ReactSharedInternals.ReactCurrentDispatcher;
        var prefix;
        function describeBuiltInComponentFrame(name, source, ownerFn) {
          {
            if (prefix === void 0) {
              try {
                throw Error();
              } catch (x) {
                var match = x.stack.trim().match(/\n( *(at )?)/);
                prefix = match && match[1] || "";
              }
            }
            return "\n" + prefix + name;
          }
        }
        var reentry = false;
        var componentFrameCache;
        {
          var PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map;
          componentFrameCache = new PossiblyWeakMap();
        }
        function describeNativeComponentFrame(fn, construct) {
          if (!fn || reentry) {
            return "";
          }
          {
            var frame = componentFrameCache.get(fn);
            if (frame !== void 0) {
              return frame;
            }
          }
          var control;
          reentry = true;
          var previousPrepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = void 0;
          var previousDispatcher;
          {
            previousDispatcher = ReactCurrentDispatcher$1.current;
            ReactCurrentDispatcher$1.current = null;
            disableLogs();
          }
          try {
            if (construct) {
              var Fake = function() {
                throw Error();
              };
              Object.defineProperty(Fake.prototype, "props", {
                set: function() {
                  throw Error();
                }
              });
              if (typeof Reflect === "object" && Reflect.construct) {
                try {
                  Reflect.construct(Fake, []);
                } catch (x) {
                  control = x;
                }
                Reflect.construct(fn, [], Fake);
              } else {
                try {
                  Fake.call();
                } catch (x) {
                  control = x;
                }
                fn.call(Fake.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (x) {
                control = x;
              }
              fn();
            }
          } catch (sample) {
            if (sample && control && typeof sample.stack === "string") {
              var sampleLines = sample.stack.split("\n");
              var controlLines = control.stack.split("\n");
              var s = sampleLines.length - 1;
              var c = controlLines.length - 1;
              while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
                c--;
              }
              for (; s >= 1 && c >= 0; s--, c--) {
                if (sampleLines[s] !== controlLines[c]) {
                  if (s !== 1 || c !== 1) {
                    do {
                      s--;
                      c--;
                      if (c < 0 || sampleLines[s] !== controlLines[c]) {
                        var _frame = "\n" + sampleLines[s].replace(" at new ", " at ");
                        if (fn.displayName && _frame.includes("<anonymous>")) {
                          _frame = _frame.replace("<anonymous>", fn.displayName);
                        }
                        {
                          if (typeof fn === "function") {
                            componentFrameCache.set(fn, _frame);
                          }
                        }
                        return _frame;
                      }
                    } while (s >= 1 && c >= 0);
                  }
                  break;
                }
              }
            }
          } finally {
            reentry = false;
            {
              ReactCurrentDispatcher$1.current = previousDispatcher;
              reenableLogs();
            }
            Error.prepareStackTrace = previousPrepareStackTrace;
          }
          var name = fn ? fn.displayName || fn.name : "";
          var syntheticFrame = name ? describeBuiltInComponentFrame(name) : "";
          {
            if (typeof fn === "function") {
              componentFrameCache.set(fn, syntheticFrame);
            }
          }
          return syntheticFrame;
        }
        function describeFunctionComponentFrame(fn, source, ownerFn) {
          {
            return describeNativeComponentFrame(fn, false);
          }
        }
        function shouldConstruct(Component2) {
          var prototype = Component2.prototype;
          return !!(prototype && prototype.isReactComponent);
        }
        function describeUnknownElementTypeFrameInDEV(type, source, ownerFn) {
          if (type == null) {
            return "";
          }
          if (typeof type === "function") {
            {
              return describeNativeComponentFrame(type, shouldConstruct(type));
            }
          }
          if (typeof type === "string") {
            return describeBuiltInComponentFrame(type);
          }
          switch (type) {
            case REACT_SUSPENSE_TYPE:
              return describeBuiltInComponentFrame("Suspense");
            case REACT_SUSPENSE_LIST_TYPE:
              return describeBuiltInComponentFrame("SuspenseList");
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_FORWARD_REF_TYPE:
                return describeFunctionComponentFrame(type.render);
              case REACT_MEMO_TYPE:
                return describeUnknownElementTypeFrameInDEV(type.type, source, ownerFn);
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return describeUnknownElementTypeFrameInDEV(init(payload), source, ownerFn);
                } catch (x) {
                }
              }
            }
          }
          return "";
        }
        var loggedTypeFailures = {};
        var ReactDebugCurrentFrame$1 = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame$1.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame$1.setExtraStackFrame(null);
            }
          }
        }
        function checkPropTypes(typeSpecs, values, location, componentName, element) {
          {
            var has = Function.call.bind(hasOwnProperty);
            for (var typeSpecName in typeSpecs) {
              if (has(typeSpecs, typeSpecName)) {
                var error$1 = void 0;
                try {
                  if (typeof typeSpecs[typeSpecName] !== "function") {
                    var err = Error((componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                    err.name = "Invariant Violation";
                    throw err;
                  }
                  error$1 = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
                } catch (ex) {
                  error$1 = ex;
                }
                if (error$1 && !(error$1 instanceof Error)) {
                  setCurrentlyValidatingElement(element);
                  error("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", componentName || "React class", location, typeSpecName, typeof error$1);
                  setCurrentlyValidatingElement(null);
                }
                if (error$1 instanceof Error && !(error$1.message in loggedTypeFailures)) {
                  loggedTypeFailures[error$1.message] = true;
                  setCurrentlyValidatingElement(element);
                  error("Failed %s type: %s", location, error$1.message);
                  setCurrentlyValidatingElement(null);
                }
              }
            }
          }
        }
        function setCurrentlyValidatingElement$1(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              setExtraStackFrame(stack);
            } else {
              setExtraStackFrame(null);
            }
          }
        }
        var propTypesMisspellWarningShown;
        {
          propTypesMisspellWarningShown = false;
        }
        function getDeclarationErrorAddendum() {
          if (ReactCurrentOwner.current) {
            var name = getComponentNameFromType(ReactCurrentOwner.current.type);
            if (name) {
              return "\n\nCheck the render method of `" + name + "`.";
            }
          }
          return "";
        }
        function getSourceInfoErrorAddendum(source) {
          if (source !== void 0) {
            var fileName = source.fileName.replace(/^.*[\\\/]/, "");
            var lineNumber = source.lineNumber;
            return "\n\nCheck your code at " + fileName + ":" + lineNumber + ".";
          }
          return "";
        }
        function getSourceInfoErrorAddendumForProps(elementProps) {
          if (elementProps !== null && elementProps !== void 0) {
            return getSourceInfoErrorAddendum(elementProps.__source);
          }
          return "";
        }
        var ownerHasKeyUseWarning = {};
        function getCurrentComponentErrorInfo(parentType) {
          var info = getDeclarationErrorAddendum();
          if (!info) {
            var parentName = typeof parentType === "string" ? parentType : parentType.displayName || parentType.name;
            if (parentName) {
              info = "\n\nCheck the top-level render call using <" + parentName + ">.";
            }
          }
          return info;
        }
        function validateExplicitKey(element, parentType) {
          if (!element._store || element._store.validated || element.key != null) {
            return;
          }
          element._store.validated = true;
          var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
          if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
            return;
          }
          ownerHasKeyUseWarning[currentComponentErrorInfo] = true;
          var childOwner = "";
          if (element && element._owner && element._owner !== ReactCurrentOwner.current) {
            childOwner = " It was passed a child from " + getComponentNameFromType(element._owner.type) + ".";
          }
          {
            setCurrentlyValidatingElement$1(element);
            error('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', currentComponentErrorInfo, childOwner);
            setCurrentlyValidatingElement$1(null);
          }
        }
        function validateChildKeys(node, parentType) {
          if (typeof node !== "object") {
            return;
          }
          if (isArray(node)) {
            for (var i = 0; i < node.length; i++) {
              var child = node[i];
              if (isValidElement(child)) {
                validateExplicitKey(child, parentType);
              }
            }
          } else if (isValidElement(node)) {
            if (node._store) {
              node._store.validated = true;
            }
          } else if (node) {
            var iteratorFn = getIteratorFn(node);
            if (typeof iteratorFn === "function") {
              if (iteratorFn !== node.entries) {
                var iterator = iteratorFn.call(node);
                var step;
                while (!(step = iterator.next()).done) {
                  if (isValidElement(step.value)) {
                    validateExplicitKey(step.value, parentType);
                  }
                }
              }
            }
          }
        }
        function validatePropTypes(element) {
          {
            var type = element.type;
            if (type === null || type === void 0 || typeof type === "string") {
              return;
            }
            var propTypes;
            if (typeof type === "function") {
              propTypes = type.propTypes;
            } else if (typeof type === "object" && (type.$$typeof === REACT_FORWARD_REF_TYPE || // Note: Memo only checks outer props here.
            // Inner props are checked in the reconciler.
            type.$$typeof === REACT_MEMO_TYPE)) {
              propTypes = type.propTypes;
            } else {
              return;
            }
            if (propTypes) {
              var name = getComponentNameFromType(type);
              checkPropTypes(propTypes, element.props, "prop", name, element);
            } else if (type.PropTypes !== void 0 && !propTypesMisspellWarningShown) {
              propTypesMisspellWarningShown = true;
              var _name = getComponentNameFromType(type);
              error("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", _name || "Unknown");
            }
            if (typeof type.getDefaultProps === "function" && !type.getDefaultProps.isReactClassApproved) {
              error("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
            }
          }
        }
        function validateFragmentProps(fragment) {
          {
            var keys = Object.keys(fragment.props);
            for (var i = 0; i < keys.length; i++) {
              var key = keys[i];
              if (key !== "children" && key !== "key") {
                setCurrentlyValidatingElement$1(fragment);
                error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", key);
                setCurrentlyValidatingElement$1(null);
                break;
              }
            }
            if (fragment.ref !== null) {
              setCurrentlyValidatingElement$1(fragment);
              error("Invalid attribute `ref` supplied to `React.Fragment`.");
              setCurrentlyValidatingElement$1(null);
            }
          }
        }
        function createElementWithValidation(type, props, children) {
          var validType = isValidElementType(type);
          if (!validType) {
            var info = "";
            if (type === void 0 || typeof type === "object" && type !== null && Object.keys(type).length === 0) {
              info += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
            }
            var sourceInfo = getSourceInfoErrorAddendumForProps(props);
            if (sourceInfo) {
              info += sourceInfo;
            } else {
              info += getDeclarationErrorAddendum();
            }
            var typeString;
            if (type === null) {
              typeString = "null";
            } else if (isArray(type)) {
              typeString = "array";
            } else if (type !== void 0 && type.$$typeof === REACT_ELEMENT_TYPE) {
              typeString = "<" + (getComponentNameFromType(type.type) || "Unknown") + " />";
              info = " Did you accidentally export a JSX literal instead of a component?";
            } else {
              typeString = typeof type;
            }
            {
              error("React.createElement: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", typeString, info);
            }
          }
          var element = createElement.apply(this, arguments);
          if (element == null) {
            return element;
          }
          if (validType) {
            for (var i = 2; i < arguments.length; i++) {
              validateChildKeys(arguments[i], type);
            }
          }
          if (type === REACT_FRAGMENT_TYPE) {
            validateFragmentProps(element);
          } else {
            validatePropTypes(element);
          }
          return element;
        }
        var didWarnAboutDeprecatedCreateFactory = false;
        function createFactoryWithValidation(type) {
          var validatedFactory = createElementWithValidation.bind(null, type);
          validatedFactory.type = type;
          {
            if (!didWarnAboutDeprecatedCreateFactory) {
              didWarnAboutDeprecatedCreateFactory = true;
              warn("React.createFactory() is deprecated and will be removed in a future major release. Consider using JSX or use React.createElement() directly instead.");
            }
            Object.defineProperty(validatedFactory, "type", {
              enumerable: false,
              get: function() {
                warn("Factory.type is deprecated. Access the class directly before passing it to createFactory.");
                Object.defineProperty(this, "type", {
                  value: type
                });
                return type;
              }
            });
          }
          return validatedFactory;
        }
        function cloneElementWithValidation(element, props, children) {
          var newElement = cloneElement.apply(this, arguments);
          for (var i = 2; i < arguments.length; i++) {
            validateChildKeys(arguments[i], newElement.type);
          }
          validatePropTypes(newElement);
          return newElement;
        }
        function startTransition(scope, options) {
          var prevTransition = ReactCurrentBatchConfig.transition;
          ReactCurrentBatchConfig.transition = {};
          var currentTransition = ReactCurrentBatchConfig.transition;
          {
            ReactCurrentBatchConfig.transition._updatedFibers = /* @__PURE__ */ new Set();
          }
          try {
            scope();
          } finally {
            ReactCurrentBatchConfig.transition = prevTransition;
            {
              if (prevTransition === null && currentTransition._updatedFibers) {
                var updatedFibersCount = currentTransition._updatedFibers.size;
                if (updatedFibersCount > 10) {
                  warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.");
                }
                currentTransition._updatedFibers.clear();
              }
            }
          }
        }
        var didWarnAboutMessageChannel = false;
        var enqueueTaskImpl = null;
        function enqueueTask(task) {
          if (enqueueTaskImpl === null) {
            try {
              var requireString = ("require" + Math.random()).slice(0, 7);
              var nodeRequire = module && module[requireString];
              enqueueTaskImpl = nodeRequire.call(module, "timers").setImmediate;
            } catch (_err) {
              enqueueTaskImpl = function(callback) {
                {
                  if (didWarnAboutMessageChannel === false) {
                    didWarnAboutMessageChannel = true;
                    if (typeof MessageChannel === "undefined") {
                      error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning.");
                    }
                  }
                }
                var channel = new MessageChannel();
                channel.port1.onmessage = callback;
                channel.port2.postMessage(void 0);
              };
            }
          }
          return enqueueTaskImpl(task);
        }
        var actScopeDepth = 0;
        var didWarnNoAwaitAct = false;
        function act(callback) {
          {
            var prevActScopeDepth = actScopeDepth;
            actScopeDepth++;
            if (ReactCurrentActQueue.current === null) {
              ReactCurrentActQueue.current = [];
            }
            var prevIsBatchingLegacy = ReactCurrentActQueue.isBatchingLegacy;
            var result;
            try {
              ReactCurrentActQueue.isBatchingLegacy = true;
              result = callback();
              if (!prevIsBatchingLegacy && ReactCurrentActQueue.didScheduleLegacyUpdate) {
                var queue = ReactCurrentActQueue.current;
                if (queue !== null) {
                  ReactCurrentActQueue.didScheduleLegacyUpdate = false;
                  flushActQueue(queue);
                }
              }
            } catch (error2) {
              popActScope(prevActScopeDepth);
              throw error2;
            } finally {
              ReactCurrentActQueue.isBatchingLegacy = prevIsBatchingLegacy;
            }
            if (result !== null && typeof result === "object" && typeof result.then === "function") {
              var thenableResult = result;
              var wasAwaited = false;
              var thenable = {
                then: function(resolve, reject) {
                  wasAwaited = true;
                  thenableResult.then(function(returnValue2) {
                    popActScope(prevActScopeDepth);
                    if (actScopeDepth === 0) {
                      recursivelyFlushAsyncActWork(returnValue2, resolve, reject);
                    } else {
                      resolve(returnValue2);
                    }
                  }, function(error2) {
                    popActScope(prevActScopeDepth);
                    reject(error2);
                  });
                }
              };
              {
                if (!didWarnNoAwaitAct && typeof Promise !== "undefined") {
                  Promise.resolve().then(function() {
                  }).then(function() {
                    if (!wasAwaited) {
                      didWarnNoAwaitAct = true;
                      error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);");
                    }
                  });
                }
              }
              return thenable;
            } else {
              var returnValue = result;
              popActScope(prevActScopeDepth);
              if (actScopeDepth === 0) {
                var _queue = ReactCurrentActQueue.current;
                if (_queue !== null) {
                  flushActQueue(_queue);
                  ReactCurrentActQueue.current = null;
                }
                var _thenable = {
                  then: function(resolve, reject) {
                    if (ReactCurrentActQueue.current === null) {
                      ReactCurrentActQueue.current = [];
                      recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                    } else {
                      resolve(returnValue);
                    }
                  }
                };
                return _thenable;
              } else {
                var _thenable2 = {
                  then: function(resolve, reject) {
                    resolve(returnValue);
                  }
                };
                return _thenable2;
              }
            }
          }
        }
        function popActScope(prevActScopeDepth) {
          {
            if (prevActScopeDepth !== actScopeDepth - 1) {
              error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
            }
            actScopeDepth = prevActScopeDepth;
          }
        }
        function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
          {
            var queue = ReactCurrentActQueue.current;
            if (queue !== null) {
              try {
                flushActQueue(queue);
                enqueueTask(function() {
                  if (queue.length === 0) {
                    ReactCurrentActQueue.current = null;
                    resolve(returnValue);
                  } else {
                    recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                  }
                });
              } catch (error2) {
                reject(error2);
              }
            } else {
              resolve(returnValue);
            }
          }
        }
        var isFlushing = false;
        function flushActQueue(queue) {
          {
            if (!isFlushing) {
              isFlushing = true;
              var i = 0;
              try {
                for (; i < queue.length; i++) {
                  var callback = queue[i];
                  do {
                    callback = callback(true);
                  } while (callback !== null);
                }
                queue.length = 0;
              } catch (error2) {
                queue = queue.slice(i + 1);
                throw error2;
              } finally {
                isFlushing = false;
              }
            }
          }
        }
        var createElement$1 = createElementWithValidation;
        var cloneElement$1 = cloneElementWithValidation;
        var createFactory = createFactoryWithValidation;
        var Children = {
          map: mapChildren,
          forEach: forEachChildren,
          count: countChildren,
          toArray,
          only: onlyChild
        };
        exports.Children = Children;
        exports.Component = Component;
        exports.Fragment = REACT_FRAGMENT_TYPE;
        exports.Profiler = REACT_PROFILER_TYPE;
        exports.PureComponent = PureComponent;
        exports.StrictMode = REACT_STRICT_MODE_TYPE;
        exports.Suspense = REACT_SUSPENSE_TYPE;
        exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals;
        exports.act = act;
        exports.cloneElement = cloneElement$1;
        exports.createContext = createContext;
        exports.createElement = createElement$1;
        exports.createFactory = createFactory;
        exports.createRef = createRef;
        exports.forwardRef = forwardRef;
        exports.isValidElement = isValidElement;
        exports.lazy = lazy;
        exports.memo = memo;
        exports.startTransition = startTransition;
        exports.unstable_act = act;
        exports.useCallback = useCallback;
        exports.useContext = useContext;
        exports.useDebugValue = useDebugValue;
        exports.useDeferredValue = useDeferredValue;
        exports.useEffect = useEffect;
        exports.useId = useId;
        exports.useImperativeHandle = useImperativeHandle;
        exports.useInsertionEffect = useInsertionEffect;
        exports.useLayoutEffect = useLayoutEffect;
        exports.useMemo = useMemo;
        exports.useReducer = useReducer;
        exports.useRef = useRef;
        exports.useState = useState;
        exports.useSyncExternalStore = useSyncExternalStore2;
        exports.useTransition = useTransition;
        exports.version = ReactVersion;
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
        }
      })();
    }
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports, module) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module.exports = require_react_production_min();
    } else {
      module.exports = require_react_development();
    }
  }
});

// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var init_tslib_es6 = __esm({
  "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
  }
});

// node_modules/@tauri-apps/api/core.js
var core_exports = {};
__export(core_exports, {
  Channel: () => Channel,
  PluginListener: () => PluginListener,
  Resource: () => Resource,
  SERIALIZE_TO_IPC_FN: () => SERIALIZE_TO_IPC_FN,
  addPluginListener: () => addPluginListener,
  checkPermissions: () => checkPermissions,
  convertFileSrc: () => convertFileSrc,
  invoke: () => invoke,
  isTauri: () => isTauri,
  requestPermissions: () => requestPermissions,
  transformCallback: () => transformCallback
});
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
async function addPluginListener(plugin, event, cb) {
  const handler = new Channel(cb);
  try {
    await invoke(`plugin:${plugin}|register_listener`, {
      event,
      handler
    });
    return new PluginListener(plugin, event, handler.id);
  } catch {
    await invoke(`plugin:${plugin}|registerListener`, { event, handler });
    return new PluginListener(plugin, event, handler.id);
  }
}
async function checkPermissions(plugin) {
  return invoke(`plugin:${plugin}|check_permissions`);
}
async function requestPermissions(plugin) {
  return invoke(`plugin:${plugin}|request_permissions`);
}
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
function convertFileSrc(filePath, protocol = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
}
function isTauri() {
  return !!(globalThis || window).isTauri;
}
var _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Resource_rid, SERIALIZE_TO_IPC_FN, Channel, PluginListener, Resource;
var init_core = __esm({
  "node_modules/@tauri-apps/api/core.js"() {
    init_tslib_es6();
    SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
    Channel = class {
      constructor(onmessage) {
        _Channel_onmessage.set(this, void 0);
        _Channel_nextMessageIndex.set(this, 0);
        _Channel_pendingMessages.set(this, []);
        _Channel_messageEndIndex.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
        }), "f");
        this.id = transformCallback((rawMessage) => {
          const index = rawMessage.index;
          if ("end" in rawMessage) {
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              this.cleanupCallback();
            } else {
              __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
            }
            return;
          }
          const message = rawMessage.message;
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
              const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
              delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            }
            if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
              this.cleanupCallback();
            }
          } else {
            __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
          }
        });
      }
      cleanupCallback() {
        window.__TAURI_INTERNALS__.unregisterCallback(this.id);
      }
      set onmessage(handler) {
        __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
      }
      get onmessage() {
        return __classPrivateFieldGet(this, _Channel_onmessage, "f");
      }
      [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
        return `__CHANNEL__:${this.id}`;
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PluginListener = class {
      constructor(plugin, event, channelId) {
        this.plugin = plugin;
        this.event = event;
        this.channelId = channelId;
      }
      async unregister() {
        return invoke(`plugin:${this.plugin}|remove_listener`, {
          event: this.event,
          channelId: this.channelId
        });
      }
    };
    Resource = class {
      get rid() {
        return __classPrivateFieldGet(this, _Resource_rid, "f");
      }
      constructor(rid) {
        _Resource_rid.set(this, void 0);
        __classPrivateFieldSet(this, _Resource_rid, rid, "f");
      }
      /**
       * Destroys and cleans up this resource from memory.
       * **You should not call any method on this object anymore and should drop any reference to it.**
       */
      async close() {
        return invoke("plugin:resources|close", {
          rid: this.rid
        });
      }
    };
    _Resource_rid = /* @__PURE__ */ new WeakMap();
  }
});

// src/domain/rolePacks.ts
var ROLE_PACKS = [
  { slug: "backend-engineer", title: "Backend Engineer", industry: "engineering", icon: "code", mission: "Design and implement reliable services, APIs, and data stores." },
  { slug: "frontend-engineer", title: "Frontend Engineer", industry: "engineering", icon: "code", mission: "Ship accessible, performant UI against a contract." },
  { slug: "mobile-engineer", title: "Mobile Engineer", industry: "engineering", icon: "code", mission: "Build native/mobile clients with offline and platform constraints." },
  { slug: "platform-engineer", title: "Platform Engineer", industry: "engineering", icon: "code", mission: "Own developer platforms, CI, internal paved roads." },
  { slug: "staff-engineer", title: "Staff Engineer", industry: "engineering", icon: "code", mission: "Set technical direction, kill complexity, unblock teams." },
  { slug: "principal-engineer", title: "Principal Engineer", industry: "engineering", icon: "code", mission: "Make multi-year technical bets with explicit trade-offs." },
  { slug: "release-engineer", title: "Release Engineer", industry: "engineering", icon: "code", mission: "Own cut, changelog, rollback, and release gates." },
  { slug: "build-engineer", title: "Build Engineer", industry: "engineering", icon: "code", mission: "Keep the build graph fast, hermetic, and reproducible." },
  { slug: "api-designer", title: "API Designer", industry: "engineering", icon: "code", mission: "Design versioned APIs with compatibility and authz." },
  { slug: "protocol-engineer", title: "Protocol Engineer", industry: "engineering", icon: "code", mission: "Specify wire protocols, idempotency, and failure modes." },
  { slug: "embedded-engineer", title: "Embedded Engineer", industry: "engineering", icon: "code", mission: "Firmware and constrained-device software with safety bars." },
  { slug: "gameplay-engineer", title: "Gameplay Engineer", industry: "engineering", icon: "code", mission: "Implement gameplay systems with determinism and feel." },
  { slug: "graphics-engineer", title: "Graphics Engineer", industry: "engineering", icon: "code", mission: "Rendering, shaders, GPU budgets." },
  { slug: "ml-engineer", title: "ML Engineer", industry: "engineering", icon: "code", mission: "Train, evaluate, and ship models with data lineage." },
  { slug: "mlops-engineer", title: "MLOps Engineer", industry: "engineering", icon: "code", mission: "Model CI, drift monitors, feature stores." },
  { slug: "data-engineer", title: "Data Engineer", industry: "engineering", icon: "code", mission: "Pipelines, warehouses, contracts, late-arriving data." },
  { slug: "analytics-engineer", title: "Analytics Engineer", industry: "engineering", icon: "code", mission: "dbt-style models, metrics, and semantic layers." },
  { slug: "site-reliability", title: "Site Reliability Engineer", industry: "engineering", icon: "code", mission: "SLOs, error budgets, toil reduction." },
  { slug: "incident-commander", title: "Incident Commander", industry: "engineering", icon: "code", mission: "Run incidents: impact, comms, next action." },
  { slug: "chaos-engineer", title: "Chaos Engineer", industry: "engineering", icon: "code", mission: "Design failure experiments with blast-radius limits." },
  { slug: "appsec", title: "Application Security", industry: "security", icon: "shield", mission: "Find and rank exploitable issues. No exploit payloads." },
  { slug: "cloudsec", title: "Cloud Security", industry: "security", icon: "shield", mission: "IAM, misconfig, public buckets, identity federation." },
  { slug: "secops", title: "SecOps Analyst", industry: "security", icon: "shield", mission: "Triage alerts, contain, document." },
  { slug: "threat-modeler", title: "Threat Modeler", industry: "security", icon: "shield", mission: "STRIDE/LINDDUN style models with trust boundaries." },
  { slug: "red-team", title: "Red Team Lead", industry: "security", icon: "shield", mission: "Adversarial exercise design. No live exploitation." },
  { slug: "blue-team", title: "Blue Team Lead", industry: "security", icon: "shield", mission: "Detection coverage and response playbooks." },
  { slug: "iam-architect", title: "IAM Architect", industry: "security", icon: "shield", mission: "Least privilege, identity lifecycle, break-glass." },
  { slug: "privacy-engineer", title: "Privacy Engineer", industry: "security", icon: "shield", mission: "Data minimization, retention, subject-rights flows." },
  { slug: "crypto-reviewer", title: "Crypto Reviewer", industry: "security", icon: "shield", mission: "Review crypto usage. Flag homemade crypto." },
  { slug: "supply-chain", title: "Supply Chain Security", industry: "security", icon: "shield", mission: "Dependencies, provenance, SBOM, signed builds." },
  { slug: "grc-analyst", title: "GRC Analyst", industry: "security", icon: "shield", mission: "Map controls to evidence. Not legal advice." },
  { slug: "pentest-scoper", title: "Pentest Scoper", industry: "security", icon: "shield", mission: "Scope tests, rules of engagement, out-of-scope." },
  { slug: "secret-hygiene", title: "Secret Hygiene Agent", industry: "security", icon: "shield", mission: "Find secret leakage patterns in code and configs." },
  { slug: "secure-code-reviewer", title: "Secure Code Reviewer", industry: "security", icon: "shield", mission: "Review diffs for injection, authz, SSRF." },
  { slug: "zero-trust", title: "Zero Trust Architect", industry: "security", icon: "shield", mission: "Device, identity, path \u2014 never network location." },
  { slug: "fp-a", title: "FP&A Analyst", industry: "finance", icon: "activity", mission: "Forecasts, variance, driver trees." },
  { slug: "controller", title: "Controller", industry: "finance", icon: "activity", mission: "Close, accruals, control gaps." },
  { slug: "treasury", title: "Treasury Analyst", industry: "finance", icon: "activity", mission: "Cash, liquidity, FX exposure." },
  { slug: "credit-risk", title: "Credit Risk Analyst", industry: "finance", icon: "activity", mission: "Score credit with documented assumptions." },
  { slug: "market-risk", title: "Market Risk Analyst", industry: "finance", icon: "activity", mission: "VaR, stress, limit breaches." },
  { slug: "quant-researcher", title: "Quant Researcher", industry: "finance", icon: "activity", mission: "Signals with leakage controls and holdout." },
  { slug: "algo-trader-reviewer", title: "Algo Reviewer", industry: "finance", icon: "activity", mission: "Review trading logic. No live orders." },
  { slug: "audit-prep", title: "Audit Prep Agent", industry: "finance", icon: "activity", mission: "PBC lists, evidence binders." },
  { slug: "tax-ops", title: "Tax Ops Analyst", industry: "finance", icon: "activity", mission: "Classify transactions. Not tax advice." },
  { slug: "revenue-ops", title: "Revenue Operations", industry: "finance", icon: "activity", mission: "Funnel math, bookings vs billings." },
  { slug: "pricing-analyst", title: "Pricing Analyst", industry: "finance", icon: "activity", mission: "Price tests, elasticity, guardrails." },
  { slug: "fraud-analyst", title: "Fraud Analyst", industry: "finance", icon: "activity", mission: "Pattern detection with false-positive cost." },
  { slug: "payments-ops", title: "Payments Ops", industry: "finance", icon: "activity", mission: "Reconciliation, chargebacks, rails." },
  { slug: "finops", title: "Cloud FinOps", industry: "finance", icon: "activity", mission: "Unit economics of cloud spend." },
  { slug: "investor-relations", title: "IR Writer", industry: "finance", icon: "activity", mission: "Draft IR notes from facts only." },
  { slug: "contract-reviewer", title: "Contract Reviewer", industry: "legal", icon: "gavel", mission: "Flag risk. Not legal advice." },
  { slug: "nda-reviewer", title: "NDA Reviewer", industry: "legal", icon: "gavel", mission: "Mutual vs one-way, residuals, term." },
  { slug: "privacy-counsel-prep", title: "Privacy Counsel Prep", industry: "legal", icon: "gavel", mission: "Map processing to lawful bases. Not advice." },
  { slug: "ip-analyst", title: "IP Analyst", industry: "legal", icon: "gavel", mission: "Prior art notes, claim charts. Not advice." },
  { slug: "compliance-ops", title: "Compliance Ops", industry: "legal", icon: "gavel", mission: "Policy vs practice gaps." },
  { slug: "vendor-dpa", title: "Vendor DPA Reviewer", industry: "legal", icon: "gavel", mission: "Subprocessors, SCCs, breach SLAs." },
  { slug: "employment-ops", title: "Employment Ops", industry: "legal", icon: "gavel", mission: "Policy drafts. Not employment advice." },
  { slug: "litigation-hold", title: "Litigation Hold Clerk", industry: "legal", icon: "gavel", mission: "Preserve scope, custodians, dates." },
  { slug: "licensing-analyst", title: "Licensing Analyst", industry: "legal", icon: "gavel", mission: "OSS license compatibility." },
  { slug: "export-control", title: "Export Control Screener", industry: "legal", icon: "gavel", mission: "Flag controlled items. Not advice." },
  { slug: "regulatory-watcher", title: "Regulatory Watcher", industry: "legal", icon: "gavel", mission: "Summarize rule changes with citations." },
  { slug: "board-secretary", title: "Board Secretary Prep", industry: "legal", icon: "gavel", mission: "Agenda, minutes template, resolutions." },
  { slug: "clinical-ops", title: "Clinical Ops", industry: "healthcare", icon: "heart", mission: "Protocol deviation notes, visit windows." },
  { slug: "medical-writer", title: "Medical Writer", industry: "healthcare", icon: "heart", mission: "Accuracy-first clinical prose. Not medical advice." },
  { slug: "pharmacovigilance", title: "Pharmacovigilance Intake", industry: "healthcare", icon: "heart", mission: "Case intake structure, seriousness." },
  { slug: "hipaa-reviewer", title: "HIPAA Reviewer", industry: "healthcare", icon: "heart", mission: "PHI handling gaps. Not legal advice." },
  { slug: "coding-specialist", title: "Medical Coding Assist", industry: "healthcare", icon: "heart", mission: "ICD/CPT suggestions with uncertainty." },
  { slug: "quality-systems", title: "Quality Systems", industry: "healthcare", icon: "heart", mission: "CAPA, deviations, change control." },
  { slug: "biostats", title: "Biostats Analyst", industry: "healthcare", icon: "heart", mission: "Analysis plans, estimands, missing data." },
  { slug: "trial-manager", title: "Trial Manager", industry: "healthcare", icon: "heart", mission: "Milestones, sites, enrollment risk." },
  { slug: "lab-ops", title: "Lab Ops", industry: "healthcare", icon: "heart", mission: "Sample chain of custody." },
  { slug: "payer-ops", title: "Payer Ops", industry: "healthcare", icon: "heart", mission: "Prior auth packets from facts." },
  { slug: "health-informatics", title: "Health Informatics", industry: "healthcare", icon: "heart", mission: "HL7/FHIR mapping, code systems." },
  { slug: "safety-officer", title: "Safety Officer", industry: "healthcare", icon: "heart", mission: "Incident, RCA, CAPA." },
  { slug: "data-steward", title: "Data Steward", industry: "data", icon: "cpu", mission: "Ownership, quality SLAs, glossary." },
  { slug: "metrics-owner", title: "Metrics Owner", industry: "data", icon: "cpu", mission: "Metric definitions that cannot drift." },
  { slug: "experiment-designer", title: "Experiment Designer", industry: "data", icon: "cpu", mission: "Power, CUPED, peeking risk." },
  { slug: "causal-analyst", title: "Causal Analyst", industry: "data", icon: "cpu", mission: "Identification strategy, threats." },
  { slug: "forecasting", title: "Forecaster", industry: "data", icon: "cpu", mission: "Time series with intervals, not point bravado." },
  { slug: "catalog-curator", title: "Catalog Curator", industry: "data", icon: "cpu", mission: "Owners, PII tags, freshness." },
  { slug: "reverse-etl", title: "Reverse ETL", industry: "data", icon: "cpu", mission: "Activate warehouse data with contracts." },
  { slug: "stream-processor", title: "Stream Processor", industry: "data", icon: "cpu", mission: "Exactly-once claims vs reality." },
  { slug: "feature-store", title: "Feature Store Owner", industry: "data", icon: "cpu", mission: "Point-in-time correctness." },
  { slug: "labeling-lead", title: "Labeling Lead", industry: "data", icon: "cpu", mission: "Rubrics, IAA, gold sets." },
  { slug: "eval-scientist", title: "Eval Scientist", industry: "data", icon: "cpu", mission: "Offline/online evals for models and agents." },
  { slug: "rag-architect", title: "RAG Architect", industry: "data", icon: "cpu", mission: "Chunking, retrieval, citation, refusal." },
  { slug: "product-manager", title: "Product Manager", industry: "product", icon: "map", mission: "PRDs, scope, acceptance." },
  { slug: "product-ops", title: "Product Ops", industry: "product", icon: "map", mission: "Process, instrumentation, launch checklists." },
  { slug: "growth-pm", title: "Growth PM", industry: "product", icon: "map", mission: "Loops, experiments, north stars." },
  { slug: "tech-pm", title: "Technical PM", industry: "product", icon: "map", mission: "API products, platform bets." },
  { slug: "discovery-researcher", title: "Discovery Researcher", industry: "product", icon: "map", mission: "Interviews, JTBD, evidence." },
  { slug: "roadmap-strategist", title: "Roadmap Strategist", industry: "product", icon: "map", mission: "Bets vs features, kill criteria." },
  { slug: "launch-manager", title: "Launch Manager", industry: "product", icon: "map", mission: "GTM, support, flags, rollback." },
  { slug: "monetization", title: "Monetization PM", industry: "product", icon: "map", mission: "Packaging, paywalls, ethics." },
  { slug: "platform-pm", title: "Platform PM", industry: "product", icon: "map", mission: "Internal customers, SLAs." },
  { slug: "ai-pm", title: "AI Product Manager", industry: "product", icon: "map", mission: "Eval harnesses, refusal, cost." },
  { slug: "solutions-architect", title: "Solutions Architect", industry: "sales", icon: "zap", mission: "Map requirements to a real architecture." },
  { slug: "sales-engineer", title: "Sales Engineer", industry: "sales", icon: "zap", mission: "Technical proposal from requirements." },
  { slug: "account-strategist", title: "Account Strategist", industry: "sales", icon: "zap", mission: "Expansion from usage evidence." },
  { slug: "rfp-writer", title: "RFP Writer", industry: "sales", icon: "zap", mission: "Answer only what is true." },
  { slug: "demo-engineer", title: "Demo Engineer", industry: "sales", icon: "zap", mission: "Reproducible demo scripts." },
  { slug: "pricing-desk", title: "Deal Desk", industry: "sales", icon: "zap", mission: "Discount policy, approvals, terms." },
  { slug: "customer-success", title: "Customer Success", industry: "sales", icon: "zap", mission: "Health, QBR, risk." },
  { slug: "onboarding-specialist", title: "Onboarding Specialist", industry: "sales", icon: "zap", mission: "Time-to-value playbooks." },
  { slug: "renewals", title: "Renewals Manager", industry: "sales", icon: "zap", mission: "Value proof, risk, ask." },
  { slug: "partner-manager", title: "Partner Manager", industry: "sales", icon: "zap", mission: "Co-sell motions, boundaries." },
  { slug: "brand-strategist", title: "Brand Strategist", industry: "marketing", icon: "spark", mission: "Positioning, not slogans first." },
  { slug: "content-strategist", title: "Content Strategist", industry: "marketing", icon: "spark", mission: "Narrative, calendar, evidence." },
  { slug: "copy-chief", title: "Copy Chief", industry: "marketing", icon: "spark", mission: "On-brand, claims-safe copy." },
  { slug: "seo-strategist", title: "SEO Strategist", industry: "marketing", icon: "spark", mission: "Intent, cannibalization, technical." },
  { slug: "lifecycle", title: "Lifecycle Marketer", industry: "marketing", icon: "spark", mission: "Journeys with consent." },
  { slug: "product-marketer", title: "Product Marketer", industry: "marketing", icon: "spark", mission: "Launch narrative, battlecards." },
  { slug: "analyst-relations", title: "Analyst Relations", industry: "marketing", icon: "spark", mission: "Briefings from facts." },
  { slug: "community", title: "Community Lead", industry: "marketing", icon: "spark", mission: "Moderation, rituals, health." },
  { slug: "demand-gen", title: "Demand Gen", industry: "marketing", icon: "spark", mission: "Pipeline math, not vanity." },
  { slug: "localization", title: "Localization Lead", industry: "marketing", icon: "spark", mission: "Register, glossary, in-context." },
  { slug: "recruiter", title: "Recruiter", industry: "hr", icon: "users", mission: "Score against a rubric." },
  { slug: "sourcer", title: "Sourcer", industry: "hr", icon: "users", mission: "Search strings, calibration." },
  { slug: "comp-analyst", title: "Comp Analyst", industry: "hr", icon: "users", mission: "Bands, geo, equity. Not advice." },
  { slug: "l-and-d", title: "L&D Designer", industry: "hr", icon: "users", mission: "Curricula with assessments." },
  { slug: "people-ops", title: "People Ops", industry: "hr", icon: "users", mission: "Policies, rituals, systems." },
  { slug: "hrbp", title: "HR Business Partner", industry: "hr", icon: "users", mission: "Org design notes. Not advice." },
  { slug: "dei-analyst", title: "DEI Analyst", industry: "hr", icon: "users", mission: "Representation metrics with care." },
  { slug: "onboarding-hr", title: "People Onboarding", industry: "hr", icon: "users", mission: "30/60/90, access, culture." },
  { slug: "performance", title: "Performance Partner", industry: "hr", icon: "users", mission: "Calibration, goals, bias checks." },
  { slug: "employer-brand", title: "Employer Brand", industry: "hr", icon: "users", mission: "True stories, not gloss." },
  { slug: "coo-chief-of-staff", title: "Chief of Staff", industry: "ops", icon: "tool", mission: "Priorities, decisions, follow-through." },
  { slug: "vendor-manager", title: "Vendor Manager", industry: "ops", icon: "tool", mission: "SLAs, exits, concentration risk." },
  { slug: "procurement", title: "Procurement", industry: "ops", icon: "tool", mission: "RFPs, TCO, policy." },
  { slug: "facilities", title: "Facilities Ops", industry: "ops", icon: "tool", mission: "Sites, safety, vendors." },
  { slug: "it-ops", title: "IT Ops", industry: "ops", icon: "tool", mission: "Access, MDM, tickets." },
  { slug: "knowledge-manager", title: "Knowledge Manager", industry: "ops", icon: "tool", mission: "Sources of truth, rot." },
  { slug: "process-miner", title: "Process Miner", industry: "ops", icon: "tool", mission: "As-is vs to-be with evidence." },
  { slug: "pmo", title: "PMO", industry: "ops", icon: "tool", mission: "Dependencies, RAID, status." },
  { slug: "internal-audit-ops", title: "Internal Audit Ops", industry: "ops", icon: "tool", mission: "Samples, evidence, findings." },
  { slug: "business-continuity", title: "BCP Planner", industry: "ops", icon: "tool", mission: "RTO/RPO, drills." },
  { slug: "process-engineer", title: "Process Engineer", industry: "manufacturing", icon: "hex", mission: "Yield, cycle time, SPC." },
  { slug: "quality-engineer", title: "Quality Engineer", industry: "manufacturing", icon: "hex", mission: "NCR, CAPA, MSA." },
  { slug: "maintenance", title: "Reliability Maintenance", industry: "manufacturing", icon: "hex", mission: "PM, PdM, spare strategy." },
  { slug: "mes-analyst", title: "MES Analyst", industry: "manufacturing", icon: "hex", mission: "Genealogy, downtime codes." },
  { slug: "supply-planner", title: "Supply Planner", industry: "manufacturing", icon: "hex", mission: "MRP, constraints, expedite." },
  { slug: "ehs", title: "EHS Officer", industry: "manufacturing", icon: "hex", mission: "Hazards, permits, incidents." },
  { slug: "lean-coach", title: "Lean Coach", industry: "manufacturing", icon: "hex", mission: "Waste, takt, standard work." },
  { slug: "npi-engineer", title: "NPI Engineer", industry: "manufacturing", icon: "hex", mission: "DFM, ramp, ECOs." },
  { slug: "calibration", title: "Calibration Tech", industry: "manufacturing", icon: "hex", mission: "Traceability, intervals." },
  { slug: "warehouse-ops", title: "Warehouse Ops", industry: "manufacturing", icon: "hex", mission: "Slotting, ASN, cycle counts." },
  { slug: "grid-analyst", title: "Grid Analyst", industry: "energy", icon: "activity", mission: "Load, congestion, outages." },
  { slug: "trader-ops", title: "Energy Trader Ops", industry: "energy", icon: "activity", mission: "Nominations, imbalances. No live trades." },
  { slug: "hse-energy", title: "Energy HSE", industry: "energy", icon: "activity", mission: "Process safety, LOTO." },
  { slug: "reservoir", title: "Reservoir Analyst", industry: "energy", icon: "activity", mission: "Decline, uncertainty." },
  { slug: "renewables-ops", title: "Renewables Ops", industry: "energy", icon: "activity", mission: "Availability, curtailment." },
  { slug: "carbon-accountant", title: "Carbon Accountant", industry: "energy", icon: "activity", mission: "Scopes, factors, gaps." },
  { slug: "ppa-analyst", title: "PPA Analyst", industry: "energy", icon: "activity", mission: "Shape risk, basis." },
  { slug: "scada-reviewer", title: "SCADA Reviewer", industry: "energy", icon: "activity", mission: "Tag hygiene, unsafe commands." },
  { slug: "permitting", title: "Energy Permitting", industry: "energy", icon: "activity", mission: "Agencies, conditions, dates." },
  { slug: "decommission", title: "Decommission Planner", industry: "energy", icon: "activity", mission: "Liabilities, waste, community." },
  { slug: "policy-analyst", title: "Policy Analyst", industry: "gov", icon: "shield", mission: "Options, incidence, evidence." },
  { slug: "budget-examiner", title: "Budget Examiner", industry: "gov", icon: "shield", mission: "Programs vs outcomes." },
  { slug: "grants-officer", title: "Grants Officer", industry: "gov", icon: "shield", mission: "Eligibility, reporting, clawback." },
  { slug: "foia-officer", title: "FOIA Officer", industry: "gov", icon: "shield", mission: "Scope, exemptions, logs." },
  { slug: "procurement-gov", title: "Public Procurement", industry: "gov", icon: "shield", mission: "Fairness, bid protest risk." },
  { slug: "oversight", title: "Oversight Analyst", industry: "gov", icon: "shield", mission: "Findings, recommendations." },
  { slug: "emergency-mgmt", title: "Emergency Manager", industry: "gov", icon: "shield", mission: "ICS, resources, public info." },
  { slug: "records", title: "Records Officer", industry: "gov", icon: "shield", mission: "Retention, classification." },
  { slug: "digital-service", title: "Digital Service", industry: "gov", icon: "shield", mission: "Services that work, not portals." },
  { slug: "open-data", title: "Open Data Steward", industry: "gov", icon: "shield", mission: "Release, quality, privacy." },
  { slug: "curriculum", title: "Curriculum Designer", industry: "education", icon: "book", mission: "Outcomes, assessments, alignment." },
  { slug: "instructional", title: "Instructional Designer", industry: "education", icon: "book", mission: "Activities that teach." },
  { slug: "registrar-ops", title: "Registrar Ops", industry: "education", icon: "book", mission: "Terms, holds, transcripts." },
  { slug: "research-admin", title: "Research Admin", industry: "education", icon: "book", mission: "Compliance, effort, awards." },
  { slug: "student-success", title: "Student Success", industry: "education", icon: "book", mission: "Risk, interventions, privacy." },
  { slug: "assessment", title: "Assessment Lead", industry: "education", icon: "book", mission: "Validity, reliability, bias." },
  { slug: "edtech", title: "EdTech Owner", industry: "education", icon: "book", mission: "Tools, data, accessibility." },
  { slug: "library-sci", title: "Knowledge Librarian", industry: "education", icon: "book", mission: "Collections, citation, access." },
  { slug: "advisor", title: "Academic Advisor Prep", industry: "education", icon: "book", mission: "Paths, prereqs. Not counseling." },
  { slug: "grant-writer", title: "Grant Writer", industry: "education", icon: "book", mission: "Aims, budget justification." },
  { slug: "editor", title: "Editor", industry: "media", icon: "eye", mission: "Accuracy, structure, voice." },
  { slug: "fact-checker", title: "Fact Checker", industry: "media", icon: "eye", mission: "Claims to sources." },
  { slug: "producer", title: "Producer", industry: "media", icon: "eye", mission: "Run of show, constraints." },
  { slug: "showrunner-assist", title: "Showrunner Assist", industry: "media", icon: "eye", mission: "Bible, continuity." },
  { slug: "rights", title: "Rights Manager", industry: "media", icon: "eye", mission: "Territories, windows, music." },
  { slug: "standards", title: "Standards & Practices", industry: "media", icon: "eye", mission: "Harm, claims, kids." },
  { slug: "audience", title: "Audience Analyst", industry: "media", icon: "eye", mission: "Retention, cohorts." },
  { slug: "archive", title: "Archive Steward", industry: "media", icon: "eye", mission: "Assets, metadata, embargoes." },
  { slug: "investigations", title: "Investigations Desk", industry: "media", icon: "eye", mission: "Documents, denials, risk." },
  { slug: "newsletter", title: "Newsletter Editor", industry: "media", icon: "eye", mission: "One idea, one ask." },
  { slug: "network-designer", title: "Network Designer", industry: "logistics", icon: "gitbranch", mission: "Nodes, modes, cost-to-serve." },
  { slug: "dispatcher", title: "Dispatcher", industry: "logistics", icon: "gitbranch", mission: "Exceptions, ETA, constraints." },
  { slug: "customs", title: "Customs Broker Assist", industry: "logistics", icon: "gitbranch", mission: "HS, docs, holds. Not advice." },
  { slug: "inventory", title: "Inventory Planner", industry: "logistics", icon: "gitbranch", mission: "SS, ABC, spoilage." },
  { slug: "last-mile", title: "Last Mile Ops", industry: "logistics", icon: "gitbranch", mission: "Density, failed delivery." },
  { slug: "fleet", title: "Fleet Manager", industry: "logistics", icon: "gitbranch", mission: "Utilization, maintenance." },
  { slug: "3pl", title: "3PL Manager", industry: "logistics", icon: "gitbranch", mission: "SLAs, chargebacks." },
  { slug: "cold-chain", title: "Cold Chain", industry: "logistics", icon: "gitbranch", mission: "Excursions, sensors." },
  { slug: "returns", title: "Returns Ops", industry: "logistics", icon: "gitbranch", mission: "Disposition, fraud." },
  { slug: "control-tower", title: "Control Tower", industry: "logistics", icon: "gitbranch", mission: "End-to-end exceptions." },
  { slug: "underwriter", title: "Underwriter Assist", industry: "insurance", icon: "shield", mission: "Appetite, referrals, terms." },
  { slug: "claims", title: "Claims Adjuster Assist", industry: "insurance", icon: "shield", mission: "Coverage, liability, reserves." },
  { slug: "actuary", title: "Actuarial Analyst", industry: "insurance", icon: "shield", mission: "Loss, trend, uncertainty." },
  { slug: "siu", title: "SIU Analyst", industry: "insurance", icon: "shield", mission: "Fraud indicators." },
  { slug: "reinsurance", title: "Reinsurance Analyst", industry: "insurance", icon: "shield", mission: "Treaties, boards, clash." },
  { slug: "product-insurance", title: "Insurance Product", industry: "insurance", icon: "shield", mission: "Forms, filings, appetite." },
  { slug: "fnol", title: "FNOL Intake", industry: "insurance", icon: "shield", mission: "First notice completeness." },
  { slug: "subrogation", title: "Subrogation", industry: "insurance", icon: "shield", mission: "Recovery paths." },
  { slug: "compliance-ins", title: "Insurance Compliance", industry: "insurance", icon: "shield", mission: "Filings, market conduct." },
  { slug: "broker", title: "Broker Assist", industry: "insurance", icon: "shield", mission: "Compare forms, not advice." },
  { slug: "acquisitions", title: "Acquisitions Analyst", industry: "realestate", icon: "home", mission: "Underwrite, risks, comps." },
  { slug: "asset-manager", title: "Asset Manager", industry: "realestate", icon: "home", mission: "NOI, capex, leasing." },
  { slug: "property-ops", title: "Property Ops", industry: "realestate", icon: "home", mission: "Work orders, vendors, SLA." },
  { slug: "development", title: "Development Manager", industry: "realestate", icon: "home", mission: "Entitlements, budget, GC." },
  { slug: "leasing", title: "Leasing", industry: "realestate", icon: "home", mission: "Stacking, concessions." },
  { slug: "esg-re", title: "Real Estate ESG", industry: "realestate", icon: "home", mission: "Energy, disclosures." },
  { slug: "construction", title: "Construction PM", industry: "realestate", icon: "home", mission: "Schedule, RFIs, safety." },
  { slug: "valuation", title: "Valuation Analyst", industry: "realestate", icon: "home", mission: "Approaches, comps, caveats." },
  { slug: "proptech", title: "PropTech Owner", industry: "realestate", icon: "home", mission: "Systems of record." },
  { slug: "facilities-re", title: "Facilities", industry: "realestate", icon: "home", mission: "Critical plant, compliance." },
  { slug: "literature", title: "Literature Reviewer", industry: "research", icon: "search", mission: "PRISMA-ish, contradictions." },
  { slug: "lab-notebook", title: "Lab Notebook Steward", industry: "research", icon: "search", mission: "Methods that reproduce." },
  { slug: "grant-scientist", title: "Grant Scientist", industry: "research", icon: "search", mission: "Aims, significance, pitfalls." },
  { slug: "reproducibility", title: "Reproducibility Agent", industry: "research", icon: "search", mission: "Rerun, seeds, env." },
  { slug: "ethics", title: "Research Ethics", industry: "research", icon: "search", mission: "Consent, dual-use flags." },
  { slug: "patent-scout", title: "Patent Scout", industry: "research", icon: "search", mission: "Landscape, not advice." },
  { slug: "survey", title: "Survey Scientist", industry: "research", icon: "search", mission: "Sampling, bias, items." },
  { slug: "simulation", title: "Simulation Scientist", industry: "research", icon: "search", mission: "Assumptions, validation." },
  { slug: "field", title: "Field Researcher", industry: "research", icon: "search", mission: "Protocols, safety, data." },
  { slug: "meta-analyst", title: "Meta Analyst", industry: "research", icon: "search", mission: "Heterogeneity, quality." },
  { slug: "lca", title: "LCA Analyst", industry: "climate", icon: "globe", mission: "Boundaries, factors, uncertainty." },
  { slug: "mrvs", title: "MRV Specialist", industry: "climate", icon: "globe", mission: "Measure, report, verify." },
  { slug: "adaptation", title: "Adaptation Planner", industry: "climate", icon: "globe", mission: "Hazards, options, equity." },
  { slug: "nature", title: "Nature-based Analyst", industry: "climate", icon: "globe", mission: "Additionality, leakage." },
  { slug: "policy-climate", title: "Climate Policy", industry: "climate", icon: "globe", mission: "Instruments, incidence." },
  { slug: "transition", title: "Transition Risk", industry: "climate", icon: "globe", mission: "Stranded assets, scenarios." },
  { slug: "offset-reviewer", title: "Offset Reviewer", industry: "climate", icon: "globe", mission: "Integrity, permanence." },
  { slug: "energy-modeler", title: "Energy System Modeler", industry: "climate", icon: "globe", mission: "Constraints, not wishes." },
  { slug: "water", title: "Water Steward", industry: "climate", icon: "globe", mission: "Basin, quality, rights." },
  { slug: "biodiversity", title: "Biodiversity Analyst", industry: "climate", icon: "globe", mission: "Metrics that mean something." },
  { slug: "scribe", title: "Meeting Scribe", industry: "common", icon: "spark", mission: "Decisions, owners, dates only." },
  { slug: "critic-general", title: "General Critic", industry: "common", icon: "spark", mission: "Attack assumptions; stay specific." },
  { slug: "translator-pro", title: "Professional Translator", industry: "common", icon: "spark", mission: "Register and terminology control." },
  { slug: "summarizer-pro", title: "Executive Summarizer", industry: "common", icon: "spark", mission: "Claims mapped to sources." },
  { slug: "prompt-engineer", title: "Prompt Engineer", industry: "common", icon: "spark", mission: "Contracts for models, evals." },
  { slug: "eval-harness", title: "Eval Harness Designer", industry: "common", icon: "spark", mission: "Cases, graders, leakage." },
  { slug: "agent-ops", title: "Agent Ops", industry: "common", icon: "spark", mission: "Cost, traces, failure classes." },
  { slug: "toolsmith", title: "Toolsmith", industry: "common", icon: "spark", mission: "Design tools agents can actually call." },
  { slug: "memory-curator", title: "Memory Curator", industry: "common", icon: "spark", mission: "What to keep, decay, never secrets." },
  { slug: "skill-author", title: "Skill Author", industry: "common", icon: "spark", mission: "SKILL.md that a Hermes agent can run." },
  { slug: "orchestrator", title: "Orchestrator", industry: "common", icon: "spark", mission: "Who speaks, when, done-when." },
  { slug: "human-gate", title: "Human Gatekeeper", industry: "common", icon: "spark", mission: "What must not be autonomous." },
  { slug: "red-team-llm", title: "LLM Red Team", industry: "common", icon: "spark", mission: "Jailbreak classes, not payloads that harm." },
  { slug: "safety-reviewer", title: "AI Safety Reviewer", industry: "common", icon: "spark", mission: "Misuse, dual-use, overreach." },
  { slug: "cost-controller", title: "Token Cost Controller", industry: "common", icon: "spark", mission: "Budgets, caching, cheaper paths." },
  { slug: "schema-guardian", title: "Schema Guardian", industry: "common", icon: "spark", mission: "Typed contracts between agents." },
  { slug: "trace-analyst", title: "Trace Analyst", industry: "common", icon: "spark", mission: "Why a run failed, from events." },
  { slug: "oncall-agent", title: "On-call Agent", industry: "common", icon: "spark", mission: "Pages, runbooks, escalate." },
  { slug: "migration-lead", title: "Migration Lead", industry: "common", icon: "spark", mission: "Strangler, dual-run, rollback." },
  { slug: "docs-auditor", title: "Docs Auditor", industry: "common", icon: "spark", mission: "Docs vs code drift." }
];
var INDUSTRIES = Array.from(new Set(ROLE_PACKS.map((p2) => p2.industry)));
var ROLE_PACK_COUNT = ROLE_PACKS.length;

// src/domain/nodeLibrary.ts
var p = (id, label, dataType, opts = {}) => ({
  id,
  label,
  direction: "input",
  dataType,
  required: false,
  multiple: false,
  ...opts
});
var inP = (port) => ({ ...port, direction: "input" });
var outP = (port) => ({ ...port, direction: "output" });
var rp = (s) => ({ sections: s, version: 1 });
var stdLearning = (focus) => `When feedback is ON, treat every run as a training example. Record reusable procedures as skills, durable facts as memory, and failures as failure memory. Never store secrets. Propose refinements only with evidence from \u22652 runs. ${focus}`;
var stdInvariants = (role) => `You are ${role}. You never act outside this identity. You do not fabricate results, invent tools you were not granted, or expose secrets in any output.`;
var NODE_DEFINITIONS = [
  {
    id: "agent.planner",
    title: "Planner",
    category: "agent",
    icon: "map",
    description: "Decomposes goals into an executable plan with dependencies and acceptance criteria.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("plan", "Plan", "JSON", { required: true })), outP(p("summary", "Summary", "Markdown"))],
    defaultPurpose: "Produce a step-by-step plan with dependencies and success criteria.",
    configSchema: [
      { key: "maxSteps", label: "Maximum steps", type: "number", default: 8 },
      { key: "planningStyle", label: "Planning style", type: "select", options: ["sequential", "parallel-friendly", "milestone"], default: "sequential" }
    ],
    rolePrompt: rp({
      identity: "You are MJ Planner, an autonomous technical planning agent.",
      mission: "Transform a goal plus context into a precise, executable, verifiable plan. Ambiguity is a defect.",
      operatingPrinciples: "Understand before structuring. Decompose along natural seams. Every step must be independently actionable. Prefer fewer well-defined steps. Mark true dependencies. Surface risks.",
      procedures: "1. Parse goal, deliverables, constraints.\n2. Inventory context and capabilities.\n3. Draft verb-first steps with done-when criteria.\n4. Build dependency edges and topological order.\n5. Emit structured JSON.",
      toolStrategy: "Use no tools unless granted. Encode missing information as investigation steps.",
      verificationStrategy: "Every deliverable maps to \u22651 step. Every step has a done-when. No cycles. JSON matches schema.",
      collaborationRules: "Downstream agents cannot ask questions. Write steps they can execute without you.",
      learningRules: stdLearning("Improve decomposition granularity from downstream failures."),
      invariants: stdInvariants("a Planner")
    })
  },
  {
    id: "agent.researcher",
    title: "Researcher",
    category: "agent",
    icon: "search",
    description: "Investigates questions with evidence discipline: sources, verification, contradictions.",
    inputs: [inP(p("query", "Query", "Text", { required: true })), inP(p("context", "Context", "Object")), inP(p("browserSession", "Browser", "BrowserSession"))],
    outputs: [outP(p("findings", "Findings", "Markdown", { required: true })), outP(p("evidence", "Evidence", "JSON"))],
    defaultPurpose: "Research the assigned question and return verified findings with cited evidence.",
    configSchema: [
      { key: "depth", label: "Research depth", type: "select", options: ["quick-scan", "standard", "exhaustive"], default: "standard" },
      { key: "requirePrimarySources", label: "Require primary sources", type: "boolean", default: true }
    ],
    rolePrompt: rp({
      identity: "You are MJ Researcher, an evidence-first investigation agent.",
      mission: "Answer with provenance-explicit findings, calibrated confidence, and honest gaps.",
      operatingPrinciples: "Observation first. Triangulate. Weight primary sources. Treat contradictions as findings. Calibrate confidence. State unknowns.",
      procedures: "Decompose into sub-questions. Gather evidence. Capture source/date/quote. Detect contradictions. Synthesize: answer, evidence, caveats.",
      toolStrategy: "Browser and MCP search when granted. Never write filesystem. Degrade to context-only if tools fail twice.",
      verificationStrategy: "Every factual claim traces to evidence or is marked inference.",
      collaborationRules: "Emit Evidence as JSON so QA can verify mechanically.",
      learningRules: stdLearning("Focus on source-verification patterns."),
      invariants: stdInvariants("a Researcher")
    })
  },
  {
    id: "agent.browser",
    title: "Browser Agent",
    category: "agent",
    icon: "globe",
    description: "Operates headless browser sessions: navigate, interact, extract, verify after each action.",
    inputs: [inP(p("objective", "Objective", "Text", { required: true })), inP(p("session", "Browser Session", "BrowserSession"))],
    outputs: [outP(p("report", "Report", "Markdown", { required: true })), outP(p("sessionOut", "Browser Session", "BrowserSession")), outP(p("extractedData", "Extracted Data", "JSON"))],
    defaultPurpose: "Accomplish the browsing objective and report observed states with evidence.",
    configSchema: [
      { key: "startUrl", label: "Start URL", type: "text" },
      { key: "maxActions", label: "Max actions", type: "number", default: 25 }
    ],
    permissions: { browserControl: true, networkAccess: true },
    rolePrompt: rp({
      identity: "You are MJ Browser Agent, driving a real headless Chromium session.",
      mission: "Achieve the browsing objective with a reproducible action log and evidence.",
      operatingPrinciples: "Never assume success. Verify DOM after each action. Identify elements precisely. Recover once, then report blockers.",
      procedures: "Navigate. Confirm load. Locate. Interact. Verify. Extract. Report.",
      toolStrategy: "All interaction via browser capability. No direct filesystem writes.",
      verificationStrategy: "A click without observable effect is a failure.",
      collaborationRules: "Return the live session so chained nodes reuse cookies/state.",
      learningRules: stdLearning("Learn site-specific recipes only when stable across runs."),
      invariants: stdInvariants("a Browser Agent")
    })
  },
  {
    id: "agent.coder",
    title: "Coder",
    category: "agent",
    icon: "code",
    description: "Writes production-quality code following the task contract; runs checks when permitted.",
    inputs: [inP(p("task", "Task", "Text", { required: true })), inP(p("spec", "Spec/Context", "Markdown")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("result", "Result", "AgentResult", { required: true })), outP(p("filesChanged", "Files Changed", "JSON"))],
    defaultPurpose: "Implement the assigned coding task to the team's quality bar.",
    configSchema: [
      { key: "language", label: "Language", type: "text" },
      { key: "styleGuide", label: "Style notes", type: "textarea" }
    ],
    permissions: { filesystemRead: true, filesystemWrite: true, terminalExecute: true },
    rolePrompt: rp({
      identity: "You are MJ Coder, producing production-grade changes inside a supervised workflow.",
      mission: "Deliver code that satisfies the contract: correct, readable, consistent, verified.",
      operatingPrinciples: "Read before writing. Smallest correct change. Match existing style. No secrets. Surface requirement conflicts.",
      procedures: "Restate as testable behavior. Survey files. Implement incrementally. Self-review. Run checks. Report files and decisions.",
      toolStrategy: "Filesystem and terminal when granted. Prefer project-native commands.",
      verificationStrategy: "Run tests if they exist. State what verification ran vs skipped.",
      collaborationRules: "Emit machine-readable file lists for Tester and Reviewer.",
      learningRules: stdLearning("Distill repo-specific patterns into skills."),
      invariants: stdInvariants("a Coder")
    })
  },
  {
    id: "agent.debugger",
    title: "Debugger",
    category: "agent",
    icon: "bug",
    description: "Diagnoses failures from traces/logs, forms hypotheses, and verifies root causes.",
    inputs: [inP(p("symptom", "Symptom", "Text", { required: true })), inP(p("trace", "Trace/Evidence", "JSON")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("diagnosis", "Diagnosis", "AgentResult", { required: true })), outP(p("hypotheses", "Hypotheses", "JSON"))],
    defaultPurpose: "Find the root cause of the reported failure with evidence.",
    rolePrompt: rp({
      identity: "You are MJ Debugger. Root causes from evidence, not vibes.",
      mission: "Convert a symptom into a verified root-cause explanation.",
      operatingPrinciples: "Read evidence first. Form competing hypotheses. Design cheap discriminating tests. Stop at root cause.",
      procedures: "Characterize. Gather. Hypothesize. Discriminate. Eliminate. Confirm. Emit diagnosis.",
      toolStrategy: "Read-only filesystem and terminal preferred.",
      verificationStrategy: "Verified when the hypothesis explains every recorded symptom.",
      collaborationRules: "Hand hypotheses as JSON so Tester can automate checks.",
      learningRules: stdLearning("Build failure-mode signatures."),
      invariants: stdInvariants("a Debugger")
    })
  },
  {
    id: "agent.tester",
    title: "Tester",
    category: "agent",
    icon: "flask",
    description: "Designs and executes verification: cases, edge conditions, regression checks.",
    inputs: [inP(p("subject", "Subject", "AgentResult", { required: true })), inP(p("spec", "Spec", "Markdown")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("report", "Test Report", "Evaluation", { required: true })), outP(p("failures", "Failures", "JSON"))],
    defaultPurpose: "Design and execute a verification suite against the subject.",
    rolePrompt: rp({
      identity: "You are MJ Tester, an autonomous verification agent.",
      mission: "Prove or refute that the subject meets its contract with explicit cases.",
      operatingPrinciples: "Happy path, edges, regressions. Failures are findings. Never rubber-stamp.",
      procedures: "Extract intended behavior. Design cases. Execute. Record expected vs actual. Emit Evaluation.",
      toolStrategy: "Terminal for test runners when granted.",
      verificationStrategy: "A pass requires observed evidence, not author intent.",
      collaborationRules: "Failures must be actionable for Coder.",
      learningRules: stdLearning("Learn recurring defect classes."),
      invariants: stdInvariants("a Tester")
    })
  },
  {
    id: "agent.critic",
    title: "Critic",
    category: "agent",
    icon: "scale",
    description: "Adversarial review: attacks assumptions, finds holes, scores quality.",
    inputs: [inP(p("proposal", "Proposal", "any", { required: true })), inP(p("rubric", "Rubric", "Text"))],
    outputs: [outP(p("critique", "Critique", "Markdown", { required: true })), outP(p("score", "Score", "Evaluation"))],
    defaultPurpose: "Attack the proposal and return a scored critique.",
    rolePrompt: rp({
      identity: "You are MJ Critic. Your job is to find what is wrong.",
      mission: "Produce a precise, evidence-backed critique that a peer can act on.",
      operatingPrinciples: "Steelman first, then attack. Separate preference from defect. Score against the rubric.",
      procedures: "Restate claim. Check evidence. Find missing cases. Score. Recommend fixes.",
      toolStrategy: "No side-effect tools. Reasoning only unless evidence ports require lookup.",
      verificationStrategy: "Every criticism cites a location or missing artifact.",
      collaborationRules: "Be harsh and specific. Never vague.",
      learningRules: stdLearning("Calibrate scoring against accepted reviews."),
      invariants: stdInvariants("a Critic")
    })
  },
  {
    id: "agent.reviewer",
    title: "Reviewer",
    category: "agent",
    icon: "eye",
    description: "Constructive code/design review with blocking vs non-blocking findings.",
    inputs: [inP(p("workProduct", "Work Product", "any", { required: true })), inP(p("standards", "Standards", "Markdown"))],
    outputs: [outP(p("review", "Review", "Markdown", { required: true })), outP(p("verdict", "Verdict", "JSON"))],
    defaultPurpose: "Review the work product and issue an approve/request-changes verdict.",
    rolePrompt: rp({
      identity: "You are MJ Reviewer, a senior peer reviewer.",
      mission: "Protect quality without blocking good work. Distinguish blockers from nits.",
      operatingPrinciples: "Correctness, security, maintainability, fit. Prefer questions over edicts when uncertain.",
      procedures: "Read fully. List blockers. List suggestions. Issue verdict APPROVE | COMMENT | REQUEST_CHANGES.",
      toolStrategy: "Read-only. No writes.",
      verificationStrategy: "Blockers must be reproducible or contract-violating.",
      collaborationRules: "Coder owns the fix. Do not rewrite the work unless asked.",
      learningRules: stdLearning("Tune what you treat as a blocker."),
      invariants: stdInvariants("a Reviewer")
    })
  },
  {
    id: "agent.qa",
    title: "QA",
    category: "agent",
    icon: "check",
    description: "End-to-end quality gate: acceptance criteria, regressions, release readiness.",
    inputs: [inP(p("build", "Build", "any", { required: true })), inP(p("criteria", "Acceptance", "Markdown"))],
    outputs: [outP(p("gate", "Gate", "Evaluation", { required: true })), outP(p("notes", "Notes", "Markdown"))],
    defaultPurpose: "Decide whether the build is release-ready against acceptance criteria.",
    rolePrompt: rp({
      identity: "You are MJ QA, the last quality gate.",
      mission: "Decide go/no-go with explicit mapping from criteria to evidence.",
      operatingPrinciples: "If evidence is missing, the criterion fails. No hopeful passes.",
      procedures: "Enumerate criteria. Collect evidence. Score. Emit gate.",
      toolStrategy: "Browser and tests when granted.",
      verificationStrategy: "Every criterion has pass/fail plus evidence pointer.",
      collaborationRules: "A no-go must name the cheapest next action.",
      learningRules: stdLearning("Learn which criteria historically catch real defects."),
      invariants: stdInvariants("a QA agent")
    })
  },
  {
    id: "agent.docs",
    title: "Docs",
    category: "agent",
    icon: "book",
    description: "Writes accurate documentation from code, specs, and traces.",
    inputs: [inP(p("source", "Source", "any", { required: true })), inP(p("audience", "Audience", "Text"))],
    outputs: [outP(p("document", "Document", "Markdown", { required: true }))],
    defaultPurpose: "Produce accurate documentation for the given source and audience.",
    rolePrompt: rp({
      identity: "You are MJ Docs, a technical writer who refuses to invent APIs.",
      mission: "Document only what exists. Mark unknowns.",
      operatingPrinciples: "Accuracy over completeness. Examples must run. No marketing language.",
      procedures: "Inventory facts. Structure for the audience. Draft. Cross-check against source.",
      toolStrategy: "Read filesystem when granted.",
      verificationStrategy: "Every command, flag, and type must appear in the source.",
      collaborationRules: "Ask Coder for missing facts instead of guessing.",
      learningRules: stdLearning("Learn the project's documentation voice."),
      invariants: stdInvariants("a Docs agent")
    })
  },
  {
    id: "agent.security",
    title: "Security",
    category: "agent",
    icon: "shield",
    description: "Threat-models and reviews for injection, secrets, SSRF, authz, supply chain.",
    inputs: [inP(p("target", "Target", "any", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("findings", "Findings", "Markdown", { required: true })), outP(p("risks", "Risks", "JSON"))],
    defaultPurpose: "Threat-model the target and report prioritized security findings.",
    rolePrompt: rp({
      identity: "You are MJ Security, a defensive reviewer.",
      mission: "Find exploitable issues and rank them. Do not produce exploit payloads.",
      operatingPrinciples: "Assume hostile input. Secrets never belong in logs. Least privilege.",
      procedures: "Map trust boundaries. Enumerate threats. Check authn/z, injection, SSRF, secrets, deps. Report.",
      toolStrategy: "Read-only. Never attempt live exploitation.",
      verificationStrategy: "Each finding has impact, likelihood, and a concrete fix.",
      collaborationRules: "Escalate destructive findings to Human Approval.",
      learningRules: stdLearning("Track recurring vulnerability classes in this stack."),
      invariants: stdInvariants("a Security agent")
    })
  },
  {
    id: "agent.synthesizer",
    title: "Synthesizer",
    category: "agent",
    icon: "layers",
    description: "Merges multiple agent outputs into one coherent deliverable.",
    inputs: [inP(p("inputs", "Inputs", "any", { required: true, multiple: true })), inP(p("brief", "Brief", "Text"))],
    outputs: [outP(p("synthesis", "Synthesis", "Markdown", { required: true })), outP(p("conflicts", "Conflicts", "JSON"))],
    defaultPurpose: "Merge connected inputs into a single coherent deliverable.",
    rolePrompt: rp({
      identity: "You are MJ Synthesizer. You reconcile, you do not invent.",
      mission: "Produce one coherent artifact and explicitly list conflicts.",
      operatingPrinciples: "Preserve provenance. Prefer primary sources. Do not average disagreements away.",
      procedures: "Inventory inputs. Align structure. Merge agreements. Surface conflicts. Emit.",
      toolStrategy: "No tools required.",
      verificationStrategy: "Every claim traces to an input or is marked original.",
      collaborationRules: "Conflicts go downstream to Judge or Human Approval.",
      learningRules: stdLearning("Learn merge structures that readers preferred."),
      invariants: stdInvariants("a Synthesizer")
    })
  },
  {
    id: "agent.supervisor",
    title: "Supervisor",
    category: "agent",
    icon: "crown",
    description: "Coordinates specialist agents, assigns work, and watches contracts.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("status", "Status", "Object", { multiple: true }))],
    outputs: [outP(p("directive", "Directive", "JSON", { required: true })), outP(p("briefing", "Briefing", "Markdown"))],
    defaultPurpose: "Coordinate the crew: assign next work and watch contracts.",
    rolePrompt: rp({
      identity: "You are MJ Supervisor, crew lead for specialist agents.",
      mission: "Keep the workflow on contract. Unblock. Do not do specialist work yourself.",
      operatingPrinciples: "Delegate. Check contracts. Escalate policy issues. Stop runaway loops.",
      procedures: "Read goal and status. Decide next assignment. Emit directive JSON.",
      toolStrategy: "Workflow-modify only when granted.",
      verificationStrategy: "Directives name owner, input, done-when, timeout.",
      collaborationRules: "Specialists are peers. Do not override their identity.",
      learningRules: stdLearning("Learn which assignments historically stalled."),
      invariants: stdInvariants("a Supervisor")
    })
  },
  {
    id: "agent.router",
    title: "Router",
    category: "agent",
    icon: "gitbranch",
    description: "Classifies work and routes it to the right specialist path.",
    inputs: [inP(p("item", "Item", "any", { required: true })), inP(p("policy", "Policy", "JSON"))],
    outputs: [outP(p("route", "Route", "JSON", { required: true })), outP(p("reason", "Reason", "Text"))],
    defaultPurpose: "Classify the item and choose a route.",
    rolePrompt: rp({
      identity: "You are MJ Router. You classify, you do not solve.",
      mission: "Pick the single best route with a short reason.",
      operatingPrinciples: "Deterministic when policy exists. Conservative default otherwise.",
      procedures: "Read item. Apply policy. Choose route id. Explain in one sentence.",
      toolStrategy: "No tools.",
      verificationStrategy: "Route id must exist in policy.",
      collaborationRules: "Downstream Switch/Condition consumes your route JSON.",
      learningRules: stdLearning("Track misroutes from feedback."),
      invariants: stdInvariants("a Router")
    })
  },
  {
    id: "agent.judge",
    title: "Judge",
    category: "agent",
    icon: "gavel",
    description: "Scores outputs against a rubric and issues a binding decision.",
    inputs: [inP(p("artifact", "Artifact", "any", { required: true })), inP(p("rubric", "Rubric", "Text", { required: true }))],
    outputs: [outP(p("decision", "Decision", "Evaluation", { required: true })), outP(p("rationale", "Rationale", "Markdown"))],
    defaultPurpose: "Score the artifact against the rubric and issue a decision.",
    rolePrompt: rp({
      identity: "You are MJ Judge. Binding, calibrated, explainable.",
      mission: "Apply the rubric literally. Do not add hidden criteria.",
      operatingPrinciples: "Score each criterion. Average only if the rubric says so. Explain dissent.",
      procedures: "Parse rubric. Score each line 0-10. Compute total. Decide PASS/FAIL.",
      toolStrategy: "No tools.",
      verificationStrategy: "Rationale quotes the rubric language used.",
      collaborationRules: "Evolution and QA consume your scores.",
      learningRules: stdLearning("Calibrate against human feedback."),
      invariants: stdInvariants("a Judge")
    })
  },
  {
    id: "agent.reflection",
    title: "Reflection",
    category: "agent",
    icon: "refresh",
    description: "Generate \u2192 critique \u2192 revise loop over an upstream draft.",
    inputs: [inP(p("draft", "Draft", "any", { required: true })), inP(p("criteria", "Criteria", "Text"))],
    outputs: [outP(p("revised", "Revised", "any", { required: true })), outP(p("log", "Reflection Log", "JSON"))],
    defaultPurpose: "Revise the draft until it meets criteria or attempts are exhausted.",
    configSchema: [
      { key: "maxAttempts", label: "Max revisions", type: "number", default: 2 },
      { key: "passThreshold", label: "Pass threshold", type: "number", default: 7 }
    ],
    rolePrompt: rp({
      identity: "You are MJ Reflection, a bounded self-critique loop.",
      mission: "Improve the draft against criteria without changing identity or inventing facts.",
      operatingPrinciples: "Bounded attempts. Keep what works. Fix only failed checks.",
      procedures: "Score draft. If below threshold, revise targeting failed checks. Repeat.",
      toolStrategy: "No side effects.",
      verificationStrategy: "Log every attempt with score and changed spans.",
      collaborationRules: "Never weaken invariants of the upstream agent.",
      learningRules: stdLearning("Learn which revisions actually raised scores."),
      invariants: stdInvariants("a Reflection agent")
    })
  },
  {
    id: "agent.evolution",
    title: "Evolution",
    category: "agent",
    icon: "dna",
    description: "Proposes prompt/skill refinements from traces. Never auto-applies invariants.",
    inputs: [inP(p("traces", "Traces", "JSON", { required: true })), inP(p("baseline", "Baseline", "Evaluation"))],
    outputs: [outP(p("candidate", "Candidate", "JSON", { required: true })), outP(p("diff", "Diff", "Markdown"))],
    defaultPurpose: "Propose an evidenced prompt or skill refinement.",
    evolutionModeDefault: "SUGGEST",
    rolePrompt: rp({
      identity: "You are MJ Evolution. You propose. Humans or gates accept.",
      mission: "Turn traces into a small, evidenced candidate change.",
      operatingPrinciples: "Never touch invariants. Prefer the smallest change that would have prevented a failure.",
      procedures: "Read traces. Isolate failure class. Draft candidate. Produce unified diff. Emit.",
      toolStrategy: "Evolution sidecar if available, else single-shot refine.",
      verificationStrategy: "Candidate must include evidence ids and a rollback snapshot.",
      collaborationRules: "Protected invariants are sacred.",
      learningRules: stdLearning("Track which proposals were accepted."),
      invariants: stdInvariants("an Evolution agent")
    })
  },
  {
    id: "agent.crew",
    title: "Agent Crew",
    category: "agent",
    icon: "crown",
    description: "A working team: one supervisor plus the local CLIs you name (Claude Code, Codex, OpenCode, Cursor, Grok, Cline, Kilo). Not a Zapier router.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("result", "Crew Result", "AgentResult", { required: true })), outP(p("log", "Crew Log", "JSON"))],
    defaultPurpose: "Coordinate the named coding agents as a team against this goal.",
    configSchema: [
      { key: "harness", label: "Lead harness", type: "select", options: ["claude", "codex", "opencode", "cursor", "grok", "cline", "kilo", "llm"], default: "claude" },
      { key: "crew", label: "Crew (comma ids)", type: "text", default: "claude,codex,opencode" }
    ],
    permissions: { terminalExecute: true, filesystemRead: true, filesystemWrite: true, mcpUse: true },
    rolePrompt: rp({
      identity: "You are MJ Crew Lead. You coordinate real coding-agent CLIs. You do not pretend to be those agents.",
      mission: "Assign work to the crew, merge their outputs, surface conflicts.",
      operatingPrinciples: "Delegate. Never fake a CLI that is not installed. Fail closed.",
      procedures: "1. Restate the goal.\n2. Split work across the crew ids.\n3. Ask each harness to execute.\n4. Merge. Name disagreements.",
      toolStrategy: "Spawn only installed harnesses.",
      verificationStrategy: "Every crew member's output is quoted or attached.",
      collaborationRules: "Specialists keep their identity. You do not rewrite their diffs.",
      learningRules: stdLearning("Track which harness pairs worked."),
      invariants: stdInvariants("a Crew Lead")
    })
  },
  {
    id: "agent.custom",
    title: "Custom Agent",
    category: "agent",
    icon: "spark",
    description: "v1 assist target. One job, one identity. Purpose is not the role prompt.",
    inputs: [inP(p("input", "Input", "any", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("output", "Output", "AgentResult", { required: true })), outP(p("notes", "Notes", "JSON"))],
    defaultPurpose: "Accomplish the assigned job.",
    feedbackLoopDefault: "OFF",
    evolutionModeDefault: "OFF",
    rolePrompt: rp({
      identity: "You are a custom MJ specialist. Identity is set when the node is created.",
      mission: "Complete the purpose of this run without leaving this identity.",
      operatingPrinciples: "Stay in role. Prefer evidence. Mark unknowns. No secrets.",
      procedures: "1. Restate the job as a testable outcome.\n2. Use only granted tools.\n3. Verify against the purpose.\n4. Emit the deliverable.",
      toolStrategy: "Use only granted tools and allowed MCP servers.",
      verificationStrategy: "The deliverable must be usable without you present.",
      collaborationRules: "Peers consume the output port. Do not rewrite the graph.",
      learningRules: stdLearning("Only when Feedback Loop is ON."),
      invariants: stdInvariants("a Custom Agent")
    })
  },
  {
    id: "agent.architect",
    title: "Architect",
    category: "agent",
    group: "v3",
    icon: "hex",
    description: "Designs system structure, interfaces, and trade-offs before coding.",
    inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("constraints", "Constraints", "Object"))],
    outputs: [outP(p("architecture", "Architecture", "Markdown", { required: true })), outP(p("adrs", "ADRs", "JSON"))],
    defaultPurpose: "Propose an architecture with explicit trade-offs and ADRs.",
    rolePrompt: rp({
      identity: "You are MJ Architect.",
      mission: "Choose a structure that a Coder can implement without inventing boundaries.",
      operatingPrinciples: "Yagni. Make trade-offs explicit. Prefer boring technology.",
      procedures: "Restate forces. Sketch 2 options. Pick one. Write ADRs. Define interfaces.",
      toolStrategy: "Read repo when granted.",
      verificationStrategy: "Every component has an owner and an interface.",
      collaborationRules: "Do not write implementation code.",
      learningRules: stdLearning("Learn which ADRs aged well."),
      invariants: stdInvariants("an Architect")
    })
  },
  {
    id: "agent.local",
    title: "Local LLM",
    category: "agent",
    group: "v3",
    icon: "cpu",
    description: "Runs against a local Ollama-compatible endpoint. No cloud keys required.",
    inputs: [inP(p("prompt", "Prompt", "Text", { required: true })), inP(p("context", "Context", "any"))],
    outputs: [outP(p("completion", "Completion", "Text", { required: true })), outP(p("meta", "Meta", "JSON"))],
    defaultPurpose: "Complete the prompt on a local model.",
    configSchema: [
      { key: "endpoint", label: "Endpoint", type: "text", default: "http://127.0.0.1:11434" },
      { key: "model", label: "Model", type: "text", default: "llama3.1" }
    ],
    providers: [{ kind: "ollama", model: "llama3.1" }],
    rolePrompt: rp({
      identity: "You are a local model worker hosted inside MJ.",
      mission: "Follow the prompt exactly. Stay offline.",
      operatingPrinciples: "No network except the configured local endpoint.",
      procedures: "Compose prompt. Call local endpoint. Return text and token meta.",
      toolStrategy: "Local HTTP only.",
      verificationStrategy: "Fail closed if the endpoint is down.",
      collaborationRules: "Treat output as untrusted text for downstream agents.",
      learningRules: stdLearning("Track which local models perform well per task."),
      invariants: stdInvariants("a Local LLM worker")
    })
  },
  // ============================ CONTROL ============================
  {
    id: "control.start",
    title: "Start",
    category: "control",
    icon: "play",
    description: "Workflow entry. Emits the initial payload.",
    inputs: [],
    outputs: [outP(p("payload", "Payload", "WorkflowContext"))],
    defaultPurpose: "Begin the workflow.",
    configSchema: [{ key: "initialPayload", label: "Initial payload (JSON)", type: "textarea", default: "{}" }]
  },
  {
    id: "control.end",
    title: "End",
    category: "control",
    icon: "stop",
    description: "Workflow terminus. Collects the final result.",
    inputs: [inP(p("result", "Result", "any", { required: true, multiple: true }))],
    outputs: [],
    defaultPurpose: "Finish and collect results."
  },
  {
    id: "control.condition",
    title: "Condition",
    category: "control",
    icon: "split",
    description: "Boolean branch on a sandboxed expression.",
    inputs: [inP(p("value", "Value", "any", { required: true }))],
    outputs: [outP(p("then", "Then", "any")), outP(p("else", "Else", "any"))],
    configSchema: [{ key: "expression", label: "Expression", type: "text", default: "Boolean(input)" }]
  },
  {
    id: "control.switch",
    title: "Switch",
    category: "control",
    icon: "switch",
    description: "Multi-way branch on a key or expression.",
    inputs: [inP(p("value", "Value", "any", { required: true }))],
    outputs: [outP(p("caseA", "Case A", "any")), outP(p("caseB", "Case B", "any")), outP(p("default", "Default", "any"))],
    configSchema: [{ key: "keyPath", label: "Key path", type: "text", default: "input.route" }]
  },
  {
    id: "control.loop",
    title: "Loop",
    category: "control",
    icon: "refresh",
    description: "Iterates a collection with a bounded max.",
    inputs: [inP(p("items", "Items", "Array", { required: true }))],
    outputs: [outP(p("item", "Item", "any")), outP(p("done", "Done", "Array"))],
    configSchema: [{ key: "maxIterations", label: "Max iterations", type: "number", default: 20 }]
  },
  {
    id: "control.parallel",
    title: "Parallel",
    category: "control",
    icon: "parallel",
    description: "Fans a payload out to concurrent branches.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("branch", "Branch", "any", { multiple: true }))]
  },
  {
    id: "control.sequential",
    title: "Sequential",
    category: "control",
    icon: "list",
    description: "Forces serial execution of downstream nodes.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "any"))]
  },
  {
    id: "control.merge",
    title: "Merge",
    category: "control",
    icon: "merge",
    description: "Joins N inputs into one object or array.",
    inputs: [inP(p("in", "In", "any", { required: true, multiple: true }))],
    outputs: [outP(p("out", "Out", "Object"))],
    configSchema: [{ key: "mode", label: "Mode", type: "select", options: ["object", "array"], default: "object" }]
  },
  {
    id: "control.split",
    title: "Split",
    category: "control",
    icon: "split",
    description: "Splits an array or object into items.",
    inputs: [inP(p("in", "In", "any", { required: true }))],
    outputs: [outP(p("items", "Items", "Array"))]
  },
  {
    id: "control.wait",
    title: "Wait",
    category: "control",
    icon: "clock",
    description: "Delays the token by a fixed duration or until a signal.",
    inputs: [inP(p("in", "In", "any"))],
    outputs: [outP(p("out", "Out", "any"))],
    configSchema: [{ key: "ms", label: "Delay (ms)", type: "number", default: 1e3 }]
  },
  {
    id: "control.retry",
    title: "Retry",
    category: "control",
    icon: "refresh",
    description: "Retries a failed upstream with backoff.",
    inputs: [inP(p("in", "In", "any", { required: true }))],
    outputs: [outP(p("out", "Out", "any")), outP(p("failed", "Failed", "Error"))],
    configSchema: [
      { key: "maxAttempts", label: "Max attempts", type: "number", default: 3 },
      { key: "backoffMs", label: "Backoff (ms)", type: "number", default: 800 }
    ]
  },
  {
    id: "control.fallback",
    title: "Fallback",
    category: "control",
    icon: "shield",
    description: "Uses a backup path when the primary fails.",
    inputs: [inP(p("primary", "Primary", "any")), inP(p("backup", "Backup", "any"))],
    outputs: [outP(p("out", "Out", "any"))]
  },
  {
    id: "control.approval",
    title: "Human Approval",
    category: "control",
    icon: "hand",
    description: "Pauses execution until a human approves or rejects.",
    inputs: [inP(p("proposal", "Proposal", "any", { required: true }))],
    outputs: [outP(p("approved", "Approved", "any")), outP(p("rejected", "Rejected", "any"))],
    defaultPurpose: "Wait for a human decision."
  },
  // ============================ CAPABILITY ============================
  {
    id: "cap.transform",
    title: "Transform",
    category: "capability",
    icon: "wand",
    description: "Sandboxed expression over the input. No eval, no this, no globals.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "any"))],
    configSchema: [{ key: "expression", label: "Expression", type: "text", default: "input" }]
  },
  {
    id: "cap.http",
    title: "HTTP",
    category: "capability",
    icon: "globe",
    description: "Bounded HTTP fetch with SSRF guards.",
    inputs: [inP(p("url", "URL", "URL", { required: true })), inP(p("body", "Body", "any"))],
    outputs: [outP(p("response", "Response", "JSON")), outP(p("error", "Error", "Error"))],
    permissions: { networkAccess: true },
    configSchema: [
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", default: 15e3 }
    ]
  },
  {
    id: "cap.filesystem",
    title: "Filesystem",
    category: "capability",
    icon: "folder",
    description: "Read/write inside the workspace root.",
    inputs: [inP(p("path", "Path", "Text", { required: true })), inP(p("content", "Content", "Text"))],
    outputs: [outP(p("result", "Result", "File")), outP(p("listing", "Listing", "JSON"))],
    permissions: { filesystemRead: true, filesystemWrite: true },
    configSchema: [{ key: "op", label: "Operation", type: "select", options: ["read", "write", "list", "mkdir", "remove"], default: "read" }]
  },
  {
    id: "cap.terminal",
    title: "Terminal",
    category: "capability",
    icon: "terminal",
    description: "Runs an allowlisted program with timeout.",
    inputs: [inP(p("command", "Command", "Text", { required: true })), inP(p("cwd", "CWD", "Text"))],
    outputs: [outP(p("stdout", "Stdout", "Text")), outP(p("result", "Result", "JSON"))],
    permissions: { terminalExecute: true },
    configSchema: [{ key: "timeoutSecs", label: "Timeout (s)", type: "number", default: 60 }]
  },
  {
    id: "cap.browser",
    title: "Browser Session",
    category: "capability",
    icon: "globe",
    description: "Creates or reuses a headless browser session.",
    inputs: [inP(p("url", "Start URL", "URL"))],
    outputs: [outP(p("session", "Session", "BrowserSession"))],
    permissions: { browserControl: true, networkAccess: true }
  },
  {
    id: "cap.json",
    title: "JSON",
    category: "capability",
    group: "v3",
    icon: "braces",
    description: "Parse, stringify, pick, or merge JSON.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "JSON"))],
    configSchema: [
      { key: "op", label: "Operation", type: "select", options: ["parse", "stringify", "pick", "merge"], default: "parse" },
      { key: "path", label: "Path", type: "text", default: "" }
    ]
  },
  {
    id: "cap.webhook",
    title: "Webhook",
    category: "capability",
    group: "v3",
    icon: "zap",
    description: "Emits or receives a signed webhook event.",
    inputs: [inP(p("payload", "Payload", "JSON"))],
    outputs: [outP(p("event", "Event", "Event"))],
    permissions: { networkAccess: true },
    configSchema: [{ key: "url", label: "URL", type: "text" }]
  },
  {
    id: "cap.cron",
    title: "Schedule",
    category: "capability",
    group: "v3",
    icon: "clock",
    description: "Triggers the workflow on a cron expression (desktop scheduler).",
    inputs: [],
    outputs: [outP(p("tick", "Tick", "Event"))],
    configSchema: [{ key: "cron", label: "Cron", type: "text", default: "0 9 * * 1-5" }]
  },
  {
    id: "cap.vector",
    title: "Vector Memory",
    category: "capability",
    group: "v3",
    icon: "cpu",
    description: "Local embedding store for RAG-style recall.",
    inputs: [inP(p("query", "Query", "Text", { required: true })), inP(p("doc", "Document", "Text"))],
    outputs: [outP(p("hits", "Hits", "JSON"))],
    configSchema: [{ key: "k", label: "Top K", type: "number", default: 5 }]
  },
  // ============================ PRESETS ============================
  ...preset("copywriter", "Copywriter", "Writes on-brand marketing copy.", "Write persuasive copy that matches the brief."),
  ...preset("seo", "SEO Analyst", "Audits and improves search visibility.", "Audit SEO and propose concrete fixes."),
  ...preset("summarizer", "Summarizer", "Compresses long material without losing claims.", "Summarize faithfully with source mapping."),
  ...preset("translator", "Translator", "Translates with register and terminology control.", "Translate accurately; keep terms consistent."),
  ...preset("support", "Support Agent", "Drafts customer replies from policy and context.", "Draft a policy-faithful support reply."),
  ...preset("data-analyst", "Data Analyst", "Turns tables into findings and charts-as-prose.", "Analyze the data and report findings."),
  ...preset("pm", "Product Manager", "Writes PRDs, scopes, and acceptance criteria.", "Turn the brief into a PRD."),
  ...preset("sre", "SRE", "Incident commander: impact, blast radius, next actions.", "Triage the incident and propose next actions."),
  ...preset("legal", "Legal Reviewer", "Flags contractual and compliance risk. Not legal advice.", "Flag legal/compliance risks. Do not give advice."),
  ...preset("ux", "UX Writer", "Microcopy, empty states, error language.", "Write precise UX copy for the surface."),
  ...preset("recruiter", "Recruiter", "Screens candidates against a rubric.", "Score the candidate against the rubric."),
  ...preset("sales", "Sales Engineer", "Turns requirements into a technical proposal.", "Draft a technical proposal from the requirements."),
  ...ROLE_PACKS.map(packToDef)
];
function packToDef(pack) {
  return {
    id: `agent.pack.${pack.industry}.${pack.slug}`,
    title: pack.title,
    category: "agent",
    group: pack.industry,
    icon: pack.icon,
    description: `${pack.mission} Hermes-class agent. Not a Zapier step.`,
    inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("context", "Context", "any"))],
    outputs: [outP(p("deliverable", "Deliverable", "AgentResult", { required: true })), outP(p("notes", "Notes", "JSON"))],
    defaultPurpose: pack.mission,
    configSchema: [
      { key: "harness", label: "Runtime", type: "select", options: ["hermes", "claude", "codex", "opencode", "cursor", "grok", "cline", "kilo", "llm"], default: "hermes" }
    ],
    permissions: { filesystemRead: true, terminalExecute: true, mcpUse: true, memoryWrite: true, skillWrite: true },
    rolePrompt: rp({
      identity: `You are MJ ${pack.title}, a Hermes-class specialist (${pack.industry}).`,
      mission: pack.mission,
      operatingPrinciples: "Stay in this identity. Prefer evidence. Mark unknowns. Never invent tools. Fail closed. You are an autonomous worker, not an n8n step.",
      procedures: `1. Restate the brief as a testable outcome.
2. Use Hermes tools when granted.
3. Verify against: ${pack.mission}
4. Emit the deliverable. Call finish.`,
      toolStrategy: "Use only granted tools. Coding CLIs (Claude/Codex/OpenCode) if harness is set to them.",
      verificationStrategy: "The deliverable must be usable without you present.",
      collaborationRules: "Peers consume deliverable + notes. Shared team memory if teamMemoryKey is set.",
      learningRules: stdLearning(`Improve ${pack.title} craft from ratings.`),
      invariants: stdInvariants(`a ${pack.title}`)
    })
  };
}
function preset(slug, title, description, purpose) {
  return [
    {
      id: `agent.preset.${slug}`,
      title,
      category: "agent",
      group: "presets",
      icon: "spark",
      description,
      inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("context", "Context", "any"))],
      outputs: [outP(p("deliverable", "Deliverable", "Markdown", { required: true })), outP(p("notes", "Notes", "JSON"))],
      defaultPurpose: purpose,
      rolePrompt: rp({
        identity: `You are MJ ${title}, a specialist agent.`,
        mission: purpose,
        operatingPrinciples: "Stay in role. Prefer evidence. Mark unknowns. No secrets.",
        procedures: `PROCEDURE
1. Parse the brief.
2. Apply ${title.toLowerCase()} craft.
3. Verify against the brief.
4. Emit the deliverable.`,
        toolStrategy: "Use only granted tools.",
        verificationStrategy: "The deliverable must be usable without you present.",
        collaborationRules: "Peers consume Markdown + notes JSON.",
        learningRules: stdLearning(`Improve ${title.toLowerCase()} craft from ratings.`),
        invariants: stdInvariants(`a ${title}`)
      })
    }
  ];
}
var DEFINITIONS_BY_ID = new Map(NODE_DEFINITIONS.map((d) => [d.id, d]));
function cloneRolePrompt(src) {
  return { version: src.version, sections: { ...src.sections } };
}

// src/graph/factory.ts
function createNodeFromDef(def, id, x, y) {
  const node = {
    id,
    definitionId: def.id,
    title: def.title,
    x,
    y,
    purpose: def.defaultPurpose ?? "",
    inputs: def.inputs.map((p2) => ({ ...p2 })),
    outputs: def.outputs.map((p2) => ({ ...p2 })),
    config: Object.fromEntries((def.configSchema ?? []).map((c) => [c.key, c.default ?? ""])),
    rolePrompt: def.rolePrompt ? cloneRolePrompt(def.rolePrompt) : {
      sections: {
        identity: def.title,
        mission: "",
        operatingPrinciples: "",
        procedures: "",
        toolStrategy: "",
        verificationStrategy: "",
        collaborationRules: "",
        learningRules: "",
        invariants: `You are a ${def.title}. You never act outside this identity.`
      },
      version: 1
    },
    feedbackLoop: def.feedbackLoopDefault ?? "OFF",
    evolutionMode: def.evolutionModeDefault ?? "OFF",
    reflection: { enabled: false, maxAttempts: 2, passThreshold: 7 },
    permissions: {
      filesystemRead: false,
      filesystemWrite: false,
      terminalExecute: false,
      networkAccess: false,
      browserControl: false,
      mcpUse: false,
      providerExecute: def.category === "agent",
      workflowModify: false,
      memoryWrite: true,
      skillWrite: true,
      evolutionPropose: true,
      evolutionAccept: false,
      secretResolve: false,
      ...def.permissions ?? {}
    },
    contract: {
      requiredCapabilities: def.requiredPermissions ?? [],
      sideEffects: [],
      successCriteria: "Output satisfies the declared output schema and the stated success criteria.",
      failureCriteria: "Output cannot be produced within timeout or fails validation.",
      timeoutMs: def.contractTimeoutMs ?? 18e4,
      retryPolicy: { maxAttempts: 2, backoffMs: 1500 }
    },
    providers: def.providers ? structuredClone(def.providers) : def.category === "agent" ? [{ kind: "cli-agent", cliProviderId: "hermes" }] : [],
    allowedMcpServers: [],
    memoryEnabled: true
  };
  if (def.category === "agent") {
    node.config.harness = node.config.harness || "claude";
    node.permissions.terminalExecute = true;
    node.permissions.filesystemRead = true;
    node.permissions.mcpUse = true;
    node.permissions.providerExecute = true;
  }
  return node;
}

// src/domain/templates.ts
var WORKFLOW_TEMPLATES = [
  {
    id: "real-agent-crew",
    name: "Real Agent Crew",
    category: "Engineering",
    description: "Start \u2192 Claude/Codex/OpenCode crew \u2192 End. Not Zapier. Requires those CLIs on PATH.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "crew", defId: "agent.crew", x: 400, y: 180, purpose: "Ship the assigned coding task using the local CLIs as a team." },
      { key: "e", defId: "control.end", x: 760, y: 220 }
    ],
    wires: [
      ["s", "payload", "crew", "goal"],
      ["crew", "result", "e", "result"]
    ]
  },
  {
    id: "research-write-review",
    name: "Research \u2192 Write \u2192 Review",
    category: "Knowledge",
    description: "Investigate a question, synthesize a document, then review it.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "r", defId: "agent.researcher", x: 360, y: 80, purpose: "Research the assigned question with cited evidence." },
      { key: "d", defId: "agent.docs", x: 360, y: 340, purpose: "Write a clear document from the findings." },
      { key: "v", defId: "agent.reviewer", x: 680, y: 200, purpose: "Review the document for accuracy and gaps." },
      { key: "e", defId: "control.end", x: 980, y: 220 }
    ],
    wires: [
      ["s", "payload", "r", "query"],
      ["r", "findings", "d", "source"],
      ["d", "document", "v", "workProduct"],
      ["v", "review", "e", "result"]
    ]
  },
  {
    id: "code-test-review",
    name: "Code \u2192 Test \u2192 Review",
    category: "Engineering",
    description: "Implement a task, verify it, then peer-review.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 240 },
      { key: "c", defId: "agent.coder", x: 360, y: 80 },
      { key: "t", defId: "agent.tester", x: 360, y: 360 },
      { key: "v", defId: "agent.reviewer", x: 680, y: 220 },
      { key: "e", defId: "control.end", x: 980, y: 240 }
    ],
    wires: [
      ["s", "payload", "c", "task"],
      ["c", "result", "t", "subject"],
      ["c", "result", "v", "workProduct"],
      ["t", "report", "e", "result"],
      ["v", "review", "e", "result"]
    ]
  },
  {
    id: "plan-parallel-synth",
    name: "Plan \u2192 Parallel Research \u2192 Synthesize",
    category: "Knowledge",
    description: "Plan, fan out research, then merge.",
    steps: [
      { key: "s", defId: "control.start", x: 60, y: 260 },
      { key: "p", defId: "agent.planner", x: 320, y: 240 },
      { key: "fan", defId: "control.parallel", x: 580, y: 240 },
      { key: "r1", defId: "agent.researcher", x: 820, y: 80 },
      { key: "r2", defId: "agent.researcher", x: 820, y: 400 },
      { key: "y", defId: "agent.synthesizer", x: 1100, y: 240 },
      { key: "e", defId: "control.end", x: 1380, y: 260 }
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "plan", "fan", "input"],
      ["fan", "branch", "r1", "query"],
      ["fan", "branch", "r2", "query"],
      ["r1", "findings", "y", "inputs"],
      ["r2", "findings", "y", "inputs"],
      ["y", "synthesis", "e", "result"]
    ]
  },
  {
    id: "browser-extract",
    name: "Browse \u2192 Extract \u2192 Analyze",
    category: "Web",
    description: "Drive a browser, extract structured data, analyze it.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "sess", defId: "cap.browser", x: 340, y: 80 },
      { key: "b", defId: "agent.browser", x: 620, y: 200 },
      { key: "a", defId: "agent.preset.data-analyst", x: 920, y: 200 },
      { key: "e", defId: "control.end", x: 1220, y: 220 }
    ],
    wires: [
      ["s", "payload", "b", "objective"],
      ["sess", "session", "b", "session"],
      ["b", "extractedData", "a", "brief"],
      ["a", "deliverable", "e", "result"]
    ]
  },
  {
    id: "security-audit",
    name: "Security Audit",
    category: "Security",
    description: "Threat-model, review, and gate a change.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "sec", defId: "agent.security", x: 360, y: 80 },
      { key: "rev", defId: "agent.reviewer", x: 360, y: 360 },
      { key: "j", defId: "agent.judge", x: 680, y: 220 },
      { key: "h", defId: "control.approval", x: 960, y: 220 },
      { key: "e", defId: "control.end", x: 1240, y: 220 }
    ],
    wires: [
      ["s", "payload", "sec", "target"],
      ["s", "payload", "rev", "workProduct"],
      ["sec", "findings", "j", "artifact"],
      ["rev", "review", "j", "rubric"],
      ["j", "decision", "h", "proposal"],
      ["h", "approved", "e", "result"]
    ]
  },
  {
    id: "incident",
    name: "Incident Triage",
    category: "Operations",
    description: "Diagnose a failure, propose a fix, wait for approval.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "d", defId: "agent.debugger", x: 360, y: 80 },
      { key: "sre", defId: "agent.preset.sre", x: 360, y: 360 },
      { key: "c", defId: "agent.coder", x: 680, y: 220 },
      { key: "h", defId: "control.approval", x: 980, y: 220 },
      { key: "e", defId: "control.end", x: 1260, y: 220 }
    ],
    wires: [
      ["s", "payload", "d", "symptom"],
      ["s", "payload", "sre", "brief"],
      ["d", "diagnosis", "c", "task"],
      ["c", "result", "h", "proposal"],
      ["h", "approved", "e", "result"]
    ]
  },
  {
    id: "docs-from-code",
    name: "Docs from Code",
    category: "Engineering",
    description: "Read a repo context and produce documentation.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 180 },
      { key: "d", defId: "agent.docs", x: 400, y: 160 },
      { key: "v", defId: "agent.reviewer", x: 720, y: 160 },
      { key: "e", defId: "control.end", x: 1040, y: 180 }
    ],
    wires: [
      ["s", "payload", "d", "source"],
      ["d", "document", "v", "workProduct"],
      ["v", "review", "e", "result"]
    ]
  },
  {
    id: "debate",
    name: "Multi-agent Debate",
    category: "Quality",
    description: "Proposal, critic, judge. High-signal decisions.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 240 },
      { key: "p", defId: "agent.planner", x: 340, y: 80 },
      { key: "k", defId: "agent.critic", x: 340, y: 380 },
      { key: "j", defId: "agent.judge", x: 680, y: 220 },
      { key: "e", defId: "control.end", x: 1e3, y: 240 }
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "plan", "k", "proposal"],
      ["k", "critique", "j", "artifact"],
      ["p", "summary", "j", "rubric"],
      ["j", "decision", "e", "result"]
    ]
  },
  {
    id: "local-offline",
    name: "Local Offline Crew",
    category: "Local",
    description: "Plan and write using a local Ollama model. No cloud keys.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 200 },
      { key: "p", defId: "agent.planner", x: 360, y: 80 },
      { key: "l", defId: "agent.local", x: 360, y: 340 },
      { key: "y", defId: "agent.synthesizer", x: 680, y: 200 },
      { key: "e", defId: "control.end", x: 980, y: 220 }
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "summary", "l", "prompt"],
      ["p", "plan", "y", "inputs"],
      ["l", "completion", "y", "inputs"],
      ["y", "synthesis", "e", "result"]
    ]
  },
  {
    id: "content-engine",
    name: "Content Engine",
    category: "Marketing",
    description: "Research, copy, SEO pass, human approval.",
    steps: [
      { key: "s", defId: "control.start", x: 60, y: 240 },
      { key: "r", defId: "agent.researcher", x: 320, y: 80 },
      { key: "c", defId: "agent.preset.copywriter", x: 320, y: 380 },
      { key: "seo", defId: "agent.preset.seo", x: 640, y: 220 },
      { key: "h", defId: "control.approval", x: 940, y: 220 },
      { key: "e", defId: "control.end", x: 1220, y: 240 }
    ],
    wires: [
      ["s", "payload", "r", "query"],
      ["s", "payload", "c", "brief"],
      ["r", "findings", "seo", "brief"],
      ["c", "deliverable", "seo", "context"],
      ["seo", "deliverable", "h", "proposal"],
      ["h", "approved", "e", "result"]
    ]
  }
];
function loadTemplate(id) {
  const t = WORKFLOW_TEMPLATES.find((x) => x.id === id);
  if (!t) return { instances: [], wires: [], skipped: [id] };
  const skipped2 = [];
  const instances2 = [];
  for (const step of t.steps) {
    const def = DEFINITIONS_BY_ID.get(step.defId);
    if (!def) {
      skipped2.push(step.defId);
      continue;
    }
    const node = createNodeFromDef(def, `n-${step.key}-${Math.random().toString(36).slice(2, 7)}`, step.x, step.y);
    node.templateKey = step.key;
    if (step.purpose) node.purpose = step.purpose;
    instances2.push(node);
  }
  return { instances: instances2, wires: t.wires, skipped: skipped2 };
}

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);

// node_modules/zustand/esm/react.mjs
var import_react = __toESM(require_react(), 1);
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = import_react.default.useSyncExternalStore(
    api.subscribe,
    import_react.default.useCallback(() => selector(api.getState()), [api, selector]),
    import_react.default.useCallback(() => selector(api.getInitialState()), [api, selector])
  );
  import_react.default.useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = ((createState) => createState ? createImpl(createState) : createImpl);

// src/graph/store.ts
var import_react2 = __toESM(require_react(), 1);

// src/domain/types.ts
var GRAPH_SCHEMA_VERSION = 2;

// src/domain/dataTypes.ts
var COMPAT = {
  any: [],
  Text: ["Text", "Markdown", "JSON", "URL", "Number", "Boolean"],
  Markdown: ["Markdown", "Text"],
  JSON: ["JSON", "Object", "Array", "Text"],
  Object: ["Object", "JSON", "WorkflowContext", "RepositoryContext", "AgentResult"],
  Array: ["Array", "JSON"],
  Image: ["Image", "File"],
  File: ["File", "Image"],
  URL: ["URL", "Text"],
  BrowserSession: ["BrowserSession"],
  AgentResult: ["AgentResult", "Text", "Markdown", "Object"],
  Evaluation: ["Evaluation", "JSON", "Object", "Text", "Markdown", "AgentResult"],
  Boolean: ["Boolean", "Text", "Number"],
  Number: ["Number", "Text"],
  Stream: ["Stream", "Text"],
  Event: ["Event", "JSON"],
  // V6 fix: a mission/workflow payload is routinely handed to an agent as its brief.
  // Without Text/Markdown/JSON here, every Start -> Agent wire was silently dropped.
  WorkflowContext: ["WorkflowContext", "Object", "Text", "Markdown", "JSON", "URL", "any"],
  RepositoryContext: ["RepositoryContext", "Object"],
  Error: ["Error", "Text"]
};
function portsCompatible(source, target) {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;
  return (COMPAT[source] ?? []).includes(target);
}

// src/app/desktop.ts
function detectHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__) ? "tauri" : "web";
}

// src/version.ts
var MJ_VERSION = "11.8.5";
var MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
var MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;

// src/app/id.ts
var n = 0;
function uid(prefix) {
  n += 1;
  return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}

// src/ipc/localDb.ts
var KEY = "mj.v3.db";
function empty() {
  return {
    workflows: [],
    executions: [],
    events: [],
    memories: [],
    skills: [],
    feedback: [],
    evolution: [],
    mcp: seedMcp(),
    approvals: [],
    dlq: [],
    secrets: {},
    runQueue: []
  };
}
function seedMcp() {
  const now = nowIso();
  const rows = [
    ["mcp.filesystem", "Filesystem", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/filesystem/index.ts"]],
    ["mcp.git", "Git", "python", ["-m", "mcp_server_git"]],
    ["mcp.memory", "Memory", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/memory/index.ts"]],
    ["mcp.sequential-thinking", "Sequential Thinking", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/sequentialthinking/index.ts"]],
    ["mcp.time", "Time", "python", ["-m", "mcp_server_time"]],
    ["mcp.github", "GitHub", "github-mcp-server", ["stdio"]],
    ["mcp.control", "Control MCP", "mj-control-mcp", ["stdio"]]
  ];
  return rows.map(([id, name, command, args]) => ({
    id,
    name,
    transport: "stdio",
    config: { transport: "stdio", command, args, enabled: id === "mcp.control", pinned: true },
    state: "AVAILABLE",
    createdAt: now,
    updatedAt: now
  }));
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}
function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
var localDb = {
  load,
  save,
  reset() {
    localStorage.removeItem(KEY);
  },
  workflowList() {
    return load().workflows.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  workflowGet(id) {
    const w = load().workflows.find((x) => x.id === id);
    if (!w) throw new Error(`workflow not found: ${id}`);
    return w;
  },
  workflowCreate(name, description) {
    const db = load();
    const id = uid("wf");
    const now = nowIso();
    const graph = {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      id,
      name,
      nodes: [],
      connections: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      groups: [],
      notes: []
    };
    db.workflows.unshift({ id, name, description, graph, createdAt: now, updatedAt: now, tags: [] });
    save(db);
    return { id };
  },
  workflowSave(id, name, description, graph) {
    const db = load();
    const w = db.workflows.find((x) => x.id === id);
    if (!w) throw new Error("workflow not found");
    w.name = name;
    w.description = description;
    w.graph = graph;
    w.updatedAt = nowIso();
    save(db);
  },
  workflowDelete(id) {
    const db = load();
    db.workflows = db.workflows.filter((w) => w.id !== id);
    save(db);
  },
  executionCreate(workflowId, workflowVersion) {
    const db = load();
    const id = uid("exec");
    db.executions.unshift({
      id,
      workflowId,
      workflowVersion,
      status: "RUNNING",
      startedAt: nowIso(),
      endedAt: null,
      error: null,
      stats: { nodesRun: 0, nodesFailed: 0, retries: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, costUsd: 0, evaluationScores: [] }
    });
    save(db);
    return { id };
  },
  executionFinish(id, status, error, stats) {
    const db = load();
    const e = db.executions.find((x) => x.id === id);
    if (!e) return;
    e.status = status;
    e.error = error;
    e.stats = stats;
    e.endedAt = nowIso();
    save(db);
  },
  executionList() {
    return load().executions;
  },
  eventEmit(executionId, kind, level, nodeId, data) {
    const db = load();
    const rec = {
      seq: db.events.length + 1,
      ts: nowIso(),
      kind,
      level,
      nodeId,
      executionId,
      data
    };
    db.events.push(rec);
    if (db.events.length > 4e3) db.events = db.events.slice(-3e3);
    save(db);
    window.dispatchEvent(new CustomEvent("mj://event", { detail: rec }));
    return rec;
  },
  executionEvents(executionId) {
    return load().events.filter((e) => e.executionId === executionId);
  },
  secretSet(ref, value) {
    const db = load();
    db.secrets[ref] = value;
    save(db);
  },
  secretDelete(ref) {
    const db = load();
    delete db.secrets[ref];
    save(db);
  },
  secretExists(refs) {
    const db = load();
    return Object.fromEntries(
      refs.map((r) => [
        r,
        db.secrets[r] ? { exists: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain. Readable by anything in this origin." } : { exists: false, location: "absent", survivesRestart: false }
      ])
    );
  },
  secretGet(ref) {
    return load().secrets[ref] ?? null;
  },
  mcpList() {
    return load().mcp;
  },
  mcpSave(cfg) {
    const db = load();
    const id = cfg.id || uid("mcp");
    const now = nowIso();
    const existing = db.mcp.find((m) => m.id === id);
    if (existing) {
      Object.assign(existing, cfg, { updatedAt: now });
    } else {
      db.mcp.push({
        id,
        name: cfg.name,
        transport: cfg.transport ?? "stdio",
        config: cfg.config ?? { transport: "stdio", enabled: true },
        state: "AVAILABLE",
        createdAt: now,
        updatedAt: now
      });
    }
    save(db);
    return { id };
  },
  mcpRemove(id) {
    const db = load();
    db.mcp = db.mcp.filter((m) => m.id !== id);
    save(db);
  },
  memoryAdd(nodeKey, kind, content, tags, importance) {
    const db = load();
    const rec = { id: uid("mem"), nodeKey, kind, content, tags, importance, createdAt: nowIso() };
    db.memories.unshift(rec);
    save(db);
    return { id: rec.id };
  },
  memorySearch(nodeKey, query, limit = 12) {
    const q = query.toLowerCase();
    return load().memories.filter((m) => m.nodeKey === nodeKey && (!q || m.content.toLowerCase().includes(q))).slice(0, limit);
  },
  memoryDelete(id) {
    const db = load();
    db.memories = db.memories.filter((m) => m.id !== id);
    save(db);
  },
  skillsList(nodeKey) {
    const all = load().skills.filter((s) => s.nodeKey === nodeKey);
    return { skills: all.filter((s) => s.active), all };
  },
  skillUpsert(args) {
    const db = load();
    const rec = {
      id: uid("skill"),
      nodeKey: args.nodeKey,
      name: args.name,
      description: args.description,
      procedure: args.procedure,
      preconditions: "",
      toolStrategy: "",
      verificationStrategy: "",
      knownFailureModes: "",
      version: 1,
      score: null,
      origin: args.origin,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      applications: 0
    };
    db.skills.push(rec);
    save(db);
    return { id: rec.id, version: 1 };
  },
  feedbackAdd(executionId, nodeKey, rating, comment) {
    const db = load();
    const rec = { id: uid("fb"), executionId, nodeKey, rating, comment, createdAt: nowIso() };
    db.feedback.unshift(rec);
    save(db);
    return { id: rec.id };
  },
  feedbackList() {
    return load().feedback;
  },
  evolutionList() {
    return load().evolution;
  },
  evolutionPropose(cand) {
    const db = load();
    const rec = {
      id: uid("evo"),
      nodeKey: cand.nodeKey ?? "",
      parentVersion: cand.parentVersion ?? 1,
      candidateVersion: cand.candidateVersion ?? 2,
      trigger: cand.trigger ?? "manual",
      evidence: cand.evidence ?? [],
      changes: cand.changes ?? {},
      baselineScore: cand.baselineScore ?? null,
      candidateScore: cand.candidateScore ?? null,
      holdoutPassed: cand.holdoutPassed ?? null,
      regressionPassed: cand.regressionPassed ?? null,
      status: "PROPOSED",
      decision: "PENDING",
      createdAt: nowIso(),
      decidedAt: null
    };
    db.evolution.unshift(rec);
    save(db);
    return { id: rec.id };
  },
  evolutionDecide(id, decision) {
    const db = load();
    const c = db.evolution.find((x) => x.id === id);
    if (c) {
      c.decision = decision;
      c.status = "DECIDED";
      c.decidedAt = nowIso();
      save(db);
    }
    return { ok: true };
  },
  approvalList() {
    return load().approvals.filter((a) => a.status === "OPEN");
  },
  approvalRequest(executionId, nodeKey, summary, payload) {
    const db = load();
    const rec = { id: uid("appr"), executionId, nodeKey, summary, payload, status: "OPEN", createdAt: nowIso() };
    db.approvals.unshift(rec);
    save(db);
    window.dispatchEvent(new CustomEvent("mj://approval", { detail: rec }));
    return { id: rec.id };
  },
  approvalDecide(id, decision) {
    const db = load();
    const a = db.approvals.find((x) => x.id === id);
    if (a) {
      a.status = decision;
      save(db);
    }
  },
  approvalGet(executionId, nodeKey) {
    const a = load().approvals.find((x) => x.executionId === executionId && x.nodeKey === nodeKey && x.status !== "OPEN");
    return a ? { decided: true, status: a.status } : { decided: false };
  },
  dlqList() {
    return load().dlq.filter((d) => d.status === "OPEN");
  },
  dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix) {
    const db = load();
    const rec = {
      id: uid("dlq"),
      executionId,
      nodeKey,
      error,
      payload,
      status: "OPEN",
      suggestedCause,
      candidateFix,
      createdAt: nowIso()
    };
    db.dlq.unshift(rec);
    save(db);
    return { id: rec.id };
  },
  dlqResolve(id) {
    const db = load();
    const d = db.dlq.find((x) => x.id === id);
    if (d) d.status = "RESOLVED";
    save(db);
  },
  runEnqueue(workflowId) {
    const db = load();
    db.runQueue.push(workflowId);
    save(db);
  },
  runTake() {
    const db = load();
    const items = db.runQueue.splice(0);
    save(db);
    return items;
  }
};

// src/ipc/client.ts
async function tauriInvoke(cmd, args) {
  const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
  return invoke2(cmd, args ?? {});
}
var useTauri = () => detectHost() === "tauri";
var browserReason = "No browser is attached in this build: MJ does not bundle or launch Chromium, so there is no session, no page and no DOM. Nothing was fetched.";
var ipc = {
  appInfo: async () => {
    if (useTauri()) return tauriInvoke("app_info");
    return {
      version: MJ_VERSION,
      platform: navigator.platform,
      workspaceRoot: "(browser workspace)",
      artifactsDir: "(memory)",
      dbHealthy: true,
      controlMcpPort: 0,
      controlMcpTransport: "stdio",
      controlMcpRunning: true,
      startupMs: 0,
      host: "webview-host",
      vendors: ["hermes-agent", "hermes-agent-self-evolution", "mcp-servers-reference", "mcp-github"]
    };
  },
  dbMaintenance: async (vacuum) => {
    if (useTauri()) return tauriInvoke("db_maintenance", { vacuum });
    if (vacuum) {
    }
    const raw = localStorage.getItem("mj.v3.db") ?? "";
    return { vacuumed: vacuum, sizeBytes: raw.length };
  },
  workflowList: async () => {
    if (useTauri()) return tauriInvoke("workflow_list");
    return localDb.workflowList();
  },
  workflowGet: async (workflowId) => {
    if (useTauri()) return tauriInvoke("workflow_get", { workflowId });
    return localDb.workflowGet(workflowId);
  },
  workflowCreate: async (name, description) => {
    if (useTauri()) return tauriInvoke("workflow_create", { name, description });
    return localDb.workflowCreate(name, description);
  },
  workflowDelete: async (workflowId) => {
    if (useTauri()) return tauriInvoke("workflow_delete", { workflowId });
    localDb.workflowDelete(workflowId);
  },
  workflowSave: async (workflowId, name, description, graph) => {
    if (useTauri()) return tauriInvoke("workflow_save", { workflowId, name, description, graph });
    localDb.workflowSave(workflowId, name, description, graph);
  },
  // V7 fix (bug T): the browser fallbacks for versioning fabricated an id and a constant
  // `version: 1`, so the version history UI showed a plausible list of versions that were never
  // stored and could not be restored. These now fail loudly. The Tauri side is real.
  versionCreate: async (workflowId, label) => {
    if (useTauri()) return tauriInvoke("workflow_version_create", { workflowId, label });
    throw new Error("Workflow versions are only stored by the native build; nothing was saved in this browser session.");
  },
  versionList: async (_workflowId) => {
    if (useTauri()) return tauriInvoke("workflow_versions", { workflowId: _workflowId });
    throw new Error("Workflow versions are only stored by the native build; this browser session has no version history to show.");
  },
  versionRestore: async (versionRecordId) => {
    if (useTauri()) return tauriInvoke("workflow_version_restore", { versionRecordId });
    throw new Error("Cannot restore a version in the browser: nothing was ever stored, so nothing was changed.");
  },
  nodeStateLoad: async (nodeKey) => {
    if (useTauri()) return tauriInvoke("node_state_load", { nodeKey });
    return {};
  },
  nodeStateSave: async (nodeKey, rolePrompt) => {
    if (useTauri()) return tauriInvoke("node_state_save", { nodeKey, rolePrompt });
  },
  memoryAdd: async (nodeKey, kind, content, tags, importance, executionId) => {
    if (useTauri()) return tauriInvoke("memory_add", { nodeKey, kind, content, tags, importance, executionId });
    return localDb.memoryAdd(nodeKey, kind, content, tags, importance);
  },
  memorySearch: async (nodeKey, query, limit = 12) => {
    if (useTauri()) return tauriInvoke("memory_search", { nodeKey, query, limit, kinds: null });
    return localDb.memorySearch(nodeKey, query, limit);
  },
  memoryDelete: async (memoryId) => {
    if (useTauri()) return tauriInvoke("memory_delete", { memoryId });
    localDb.memoryDelete(memoryId);
  },
  skillsList: async (nodeKey) => {
    if (useTauri()) return tauriInvoke("skills_list", { nodeKey });
    return localDb.skillsList(nodeKey);
  },
  skillTouch: async (skillIds) => {
    if (useTauri()) return tauriInvoke("skill_touch", { skill_ids: skillIds });
    throw new Error("Skill usage counts live in the native build's SQLite store; the browser preview has no skill store to update.");
  },
  skillDeactivate: async (skillId) => {
    if (useTauri()) return tauriInvoke("skill_deactivate", { skill_id: skillId });
  },
  skillUpsert: async (args) => {
    if (useTauri()) return tauriInvoke("skill_upsert", args);
    return localDb.skillUpsert(args);
  },
  feedbackAdd: async (executionId, nodeKey, rating, comment) => {
    if (useTauri()) return tauriInvoke("feedback_add", { executionId, nodeKey, rating, comment });
    return localDb.feedbackAdd(executionId, nodeKey, rating, comment);
  },
  feedbackList: async () => {
    if (useTauri()) return tauriInvoke("feedback_list");
    return localDb.feedbackList();
  },
  // V7 fix (bug T): these returned fabricated ids and empty lists. A fabricated evaluation id
  // implies a stored result that does not exist, and an empty list is indistinguishable from
  // "no evaluations have ever run" — both read as success while nothing happened.
  evaluationSave: async (nodeKey, executionId, suite, score, details) => {
    if (useTauri()) return tauriInvoke("evaluation_save", { nodeKey, executionId, suite, score, details });
    throw new Error("Evaluation results live in the native build's SQLite database; the browser preview has no database to write.");
  },
  evaluationHistory: async (nodeKey) => {
    if (useTauri()) return tauriInvoke("evaluation_history", { nodeKey });
    throw new Error("Evaluation history lives in the native build's SQLite database; the browser preview has no database to read.");
  },
  suiteList: async () => {
    if (useTauri()) return tauriInvoke("suite_list");
    throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to read.");
  },
  suiteSave: async (args) => {
    if (useTauri()) return tauriInvoke("suite_save", args);
    throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to write.");
  },
  evolutionProposeSave: async (cand) => {
    if (useTauri()) return tauriInvoke("evolution_propose_save", { cand });
    return localDb.evolutionPropose(cand);
  },
  evolutionList: async (nodeKey) => {
    if (useTauri()) return tauriInvoke("evolution_list", { nodeKey: nodeKey ?? null });
    return localDb.evolutionList();
  },
  evolutionDecide: async (candidateId, decision) => {
    if (useTauri()) return tauriInvoke("evolution_decide", { candidateId, decision });
    return localDb.evolutionDecide(candidateId, decision);
  },
  evolutionRollback: async (candidateId, restoreRolePrompt) => {
    if (useTauri()) return tauriInvoke("evolution_rollback", { candidateId, restoreRolePrompt: restoreRolePrompt ?? null });
  },
  approvalRequest: async (executionId, nodeKey, summary, payload) => {
    if (useTauri()) return tauriInvoke("approval_request", { executionId, nodeKey, summary, payload });
    return localDb.approvalRequest(executionId, nodeKey, summary, payload);
  },
  approvalGet: async (executionId, nodeKey) => {
    if (useTauri()) return tauriInvoke("approval_get", { executionId, nodeKey });
    return localDb.approvalGet(executionId, nodeKey);
  },
  approvalList: async () => {
    if (useTauri()) return tauriInvoke("approval_list");
    return localDb.approvalList();
  },
  approvalDecide: async (approvalId, decision) => {
    if (useTauri()) return tauriInvoke("approval_decide", { approvalId, decision });
    localDb.approvalDecide(approvalId, decision);
  },
  executionCreate: async (workflowId, workflowVersion) => {
    if (useTauri()) return tauriInvoke("execution_create", { workflowId, workflowVersion });
    return localDb.executionCreate(workflowId, workflowVersion);
  },
  executionFinish: async (executionId, status, error, stats) => {
    if (useTauri()) return tauriInvoke("execution_finish", { executionId, status, error, stats });
    localDb.executionFinish(executionId, status, error, stats);
  },
  eventEmit: async (executionId, kind, level, nodeId, data) => {
    if (useTauri()) {
      const rec = await tauriInvoke("event_emit", { executionId, kind, level, nodeId, data });
      window.dispatchEvent(new CustomEvent("mj://event", { detail: rec }));
      return rec;
    }
    return localDb.eventEmit(executionId, kind, level, nodeId, data);
  },
  executionEvents: async (executionId) => {
    if (useTauri()) return tauriInvoke("execution_events", { executionId });
    return localDb.executionEvents(executionId);
  },
  executionTrace: async (executionId) => {
    if (useTauri()) return tauriInvoke("execution_trace", { executionId });
    return { events: localDb.executionEvents(executionId), status: "COMPLETED" };
  },
  executionList: async () => {
    if (useTauri()) return tauriInvoke("execution_list");
    return localDb.executionList();
  },
  dlqAdd: async (executionId, nodeKey, error, payload, suggestedCause, candidateFix) => {
    if (useTauri()) return tauriInvoke("dlq_add", { executionId, nodeKey, error, payload, suggestedCause, candidateFix });
    return localDb.dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix);
  },
  dlqList: async () => {
    if (useTauri()) return tauriInvoke("dlq_list");
    return localDb.dlqList();
  },
  dlqResolve: async (dlqId) => {
    if (useTauri()) return tauriInvoke("dlq_resolve", { dlqId });
    localDb.dlqResolve(dlqId);
  },
  runRequestTake: async () => {
    if (useTauri()) return tauriInvoke("run_request_take");
    return localDb.runTake();
  },
  evolutionServiceHealth: async () => {
    if (useTauri()) return tauriInvoke("evolution_service_health");
    return {
      available: false,
      transport: "stdio",
      reason: "The evolution service is a stdio child process of the native host. Build the desktop app (npm run tauri:build).",
      engine: "mj_evolution.stdio_server",
      hooks: ["on_session_start", "pre_llm_call", "post_llm_call", "on_session_end"]
    };
  },
  hermesBridge: async (msg) => {
    if (useTauri()) return tauriInvoke("hermes_bridge", { msg });
    return { ok: true, transport: "in-process", echo: msg };
  },
  evolutionServicePropose: async (args) => {
    if (useTauri()) return tauriInvoke("evolution_service_propose", { args });
    return null;
  },
  secretSet: async (secretRef, value) => {
    if (useTauri()) return tauriInvoke("secret_set", { secretRef, value });
    localDb.secretSet(secretRef, value);
    return { stored: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain." };
  },
  secretDelete: async (secretRef) => {
    if (useTauri()) return tauriInvoke("secret_delete", { secretRef });
    localDb.secretDelete(secretRef);
  },
  secretExists: async (refs) => {
    if (useTauri()) return tauriInvoke("secret_exists", { secretRefs: refs });
    return localDb.secretExists(refs);
  },
  llmChat: async (req) => {
    if (useTauri()) return tauriInvoke("llm_chat", { req });
    const key = localDb.secretGet(req.secret_ref);
    if (req.provider === "ollama" || req.base_url?.includes("11434")) {
      try {
        const r = await fetch(`${req.base_url || "http://127.0.0.1:11434"}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: req.model,
            stream: false,
            messages: [
              ...req.system ? [{ role: "system", content: req.system }] : [],
              ...req.messages
            ]
          })
        });
        const j = await r.json();
        return {
          content: j.message?.content ?? "",
          model: req.model,
          usage: { input_tokens: 0, output_tokens: 0 },
          duration_ms: 0
        };
      } catch (e) {
        throw new Error(`ollama unreachable: ${e}`);
      }
    }
    if (!key) throw new Error(`secret not found: ${req.secret_ref}`);
    throw new Error("Cloud LLM calls from the web host require the native desktop build (CORS). Use Local LLM / Ollama or run `npm run tauri`.");
  },
  fsRead: async (path) => {
    if (useTauri()) return tauriInvoke("fs_read", { path });
    throw new Error("Filesystem is available in the native desktop build.");
  },
  fsWrite: async (path, content) => {
    if (useTauri()) return tauriInvoke("fs_write", { path, content });
    throw new Error("Filesystem is available in the native desktop build.");
  },
  fsList: async (path) => {
    if (useTauri()) return tauriInvoke("fs_list", { path });
    return [];
  },
  fsMkdir: async (path) => {
    if (useTauri()) return tauriInvoke("fs_mkdir", { path });
  },
  fsRemove: async (path, recursive) => {
    if (useTauri()) return tauriInvoke("fs_remove", { path, recursive });
  },
  shellExec: async (program, args, cwd, timeoutSecs) => {
    if (useTauri()) return tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs });
    throw new Error("Terminal is available in the native desktop build.");
  },
  mcpServerList: async () => {
    if (useTauri()) return tauriInvoke("mcp_server_list");
    return localDb.mcpList();
  },
  mcpServerSave: async (cfg) => {
    if (useTauri()) return tauriInvoke("mcp_server_save", { cfg });
    return localDb.mcpSave(cfg);
  },
  mcpServerRemove: async (serverId) => {
    if (useTauri()) return tauriInvoke("mcp_server_remove", { serverId });
    localDb.mcpRemove(serverId);
  },
  mcpConnectTest: async (serverId) => {
    if (useTauri()) return tauriInvoke("mcp_connect_test", { serverId });
    const s = localDb.mcpList().find((m) => m.id === serverId);
    return {
      serverId,
      connected: false,
      lastError: "Connect from the native desktop build (stdio MCP).",
      toolCount: 0,
      name: s?.name
    };
  },
  mcpCall: async (serverId, tool, args) => {
    if (useTauri()) return tauriInvoke("mcp_call", { serverId, tool, arguments: args });
    throw new Error("MCP calls require the native desktop build.");
  },
  // V7 fix (bug V): these browser fallbacks invented a session id, a page title and an engine
  // name. An agent or a page reading them would conclude a real navigation had happened. Every
  // one of them now reports the same notAttached shape the Rust side does.
  /**
   * `key` is what makes browser use autonomous: pass a stable key (a node key, a workflow id) and
   * the same session comes back, so a loop that navigates repeatedly drives one tab with its
   * history and cookies intact instead of leaking a fresh browser context on every call.
   */
  browserSessionCreate: async (key) => {
    if (useTauri()) return tauriInvoke("browser_session_create", { key });
    return { ok: false, notAttached: true, engine: null, sessionId: null, reason: browserReason };
  },
  browserSessionClose: async (sessionId) => {
    if (useTauri()) return tauriInvoke("browser_session_close", { sessionId });
  },
  browserSessions: async () => {
    if (useTauri()) return tauriInvoke("browser_sessions");
    return [];
  },
  browserNavigate: async (sessionId, url, timeoutMs = 3e4) => {
    if (useTauri()) return tauriInvoke("browser_navigate", { sessionId, url, timeoutMs });
    return { ok: false, notAttached: true, url, title: null, engine: null, reason: browserReason };
  },
  browserAct: async (args) => {
    if (useTauri()) return tauriInvoke("browser_act", args);
    return { ok: false, notAttached: true, reason: browserReason };
  },
  browserScreenshot: async (sessionId, fullPage = false) => {
    if (useTauri()) return tauriInvoke("browser_screenshot", { sessionId, fullPage });
    return { ok: false, notAttached: true, path: null, reason: browserReason };
  },
  browserConsole: async (sessionId) => {
    if (useTauri()) return tauriInvoke("browser_console", { sessionId });
    return { ok: false, notAttached: true, console: [], networkFailures: [], reason: browserReason };
  },
  cliProvidersDetect: async () => {
    if (useTauri()) return tauriInvoke("cli_providers_detect");
    return [
      { id: "claude", name: "Claude Code", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "claude" },
      { id: "codex", name: "OpenAI Codex CLI", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "codex" },
      { id: "opencode", name: "OpenCode", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "opencode" },
      { id: "openclaude", name: "OpenClaude", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "openclaude" },
      { id: "copilot", name: "GitHub Copilot CLI", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "copilot" },
      { id: "grok", name: "Grok Build (xAI)", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "grok" },
      { id: "kilo", name: "Kilo Code", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "kilo" },
      { id: "gemini", name: "Gemini CLI", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "gemini" },
      { id: "qwen", name: "Qwen Code", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "qwen" }
    ];
  },
  /**
   * §6 Diagnostics: where MJ searched for each coding-agent binary, what it resolved to, and the
   * version it reported. "Not installed" without this is unactionable — a packaged app does not
   * inherit your shell's PATH, so the CLI can exist and still be invisible.
   */
  cliEnv: async () => {
    if (useTauri()) return tauriInvoke("cli_env", {});
    throw new Error("CLI diagnostics require the native desktop build.");
  },
  /**
   * `argv`, when supplied, is the exact argument vector to run — MJ 6 builds it in
   * `src/mission/harnessPolicy.ts` so the risk -> sandbox mapping lives in one typed place
   * instead of being duplicated in Rust. Omit it and the Rust side falls back to its own table
   * (the V5 path, kept for the Providers page).
   */
  cliInvoke: async (providerId, prompt, cwd, timeoutSecs = 600, argv) => {
    if (useTauri()) return tauriInvoke("cli_invoke", { providerId, prompt, cwd, timeoutSecs, argv: argv ?? null });
    throw new Error("CLI providers require the native desktop build.");
  },
  /* -------------------------------------------- custom harnesses (V11.6)
   * User-registered harnesses: name + binary + argv template ($PROMPT). In the native
   * app the Rust side owns the registry (custom-harnesses.json in the app data dir)
   * and re-validates every save — cli_invoke only ever runs a bin that is either in
   * the built-in allowlist or in this saved registry. In the web preview the list
   * lives in localStorage so the Teams connect panel stays manageable; running
   * still requires the native build (a browser cannot spawn processes).
   */
  customHarnessList: async () => {
    if (useTauri()) return tauriInvoke("custom_harness_list");
    try {
      const raw = JSON.parse(localStorage.getItem("mj.customHarnesses") ?? "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  },
  customHarnessSave: async (harness) => {
    if (useTauri()) return tauriInvoke("custom_harness_save", { harness });
    const list = await ipc.customHarnessList();
    const i = list.findIndex((h) => h.id === harness.id);
    if (i >= 0) list[i] = harness;
    else list.push(harness);
    localStorage.setItem("mj.customHarnesses", JSON.stringify(list));
    return { saved: true, created: i < 0, count: list.length };
  },
  customHarnessDelete: async (id) => {
    if (useTauri()) return tauriInvoke("custom_harness_delete", { id });
    const list = (await ipc.customHarnessList()).filter((h) => h.id !== id);
    localStorage.setItem("mj.customHarnesses", JSON.stringify(list));
    return { deleted: true, count: list.length };
  },
  /* -------------------------------------------------------------- git
   * Every one of these throws in a browser build rather than returning an empty result. A git panel
   * that renders "no changes" when it never spoke to git is the exact false-success pattern MJ forbids:
   * the user cannot tell "clean tree" from "never checked". The thrown message is the label.
   */
  gitIsRepo: async (cwd) => {
    if (useTauri()) return tauriInvoke("git_is_repo", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  gitStatus: async (cwd) => {
    if (useTauri()) return tauriInvoke("git_status", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  gitDiff: async (cwd, staged = false, budget) => {
    if (useTauri()) return tauriInvoke("git_diff", { cwd, staged, budget: budget ?? null });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  gitHead: async (cwd) => {
    if (useTauri()) return tauriInvoke("git_head", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  gitBranch: async (cwd) => {
    if (useTauri()) return tauriInvoke("git_branch", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  /**
   * Did a seat that was told to be read-only actually refrain from writing?
   * A harness flag is a promise; this is the check. Three-way on purpose — see `git.rs`.
   */
  gitReadOnlyCheck: async (cwd) => {
    if (useTauri()) return tauriInvoke("git_read_only_check", { cwd });
    throw new Error("git needs the native desktop build: a browser cannot see your repository.");
  },
  packageExport: async (workflowId, includeHistory) => {
    if (useTauri()) return tauriInvoke("package_export", { workflowId, includeHistory });
    const wf = localDb.workflowGet(workflowId);
    return {
      packageFormat: 1,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      application: "MJ",
      version: MJ_VERSION,
      workflow: { name: wf.name, description: wf.description, graph: wf.graph },
      history: [],
      secretsIncluded: false
    };
  },
  packageImport: async (pkg) => {
    if (useTauri()) return tauriInvoke("package_import", { pkg });
    const p2 = pkg;
    if (p2.application !== "MJ" || !p2.workflow) throw new Error("package rejected");
    const created = localDb.workflowCreate(`${p2.workflow.name} (imported)`, p2.workflow.description ?? "");
    localDb.workflowSave(created.id, `${p2.workflow.name} (imported)`, p2.workflow.description ?? "", p2.workflow.graph);
    return { id: created.id, validated: true };
  },
  controlValidate: async (workflowId) => {
    if (useTauri()) return tauriInvoke("control_validate_graph", { workflowId });
    return { valid: true, errors: [] };
  },
  controlConnectPorts: async (args) => {
    if (useTauri()) return tauriInvoke("control_connect_ports", args);
    throw new Error("use graph store connect");
  }
};

// src/graph/store.ts
var THEME_IDS = ["inscribed", "chalk", "carbon", "bone", "indigo", "sage", "hazard", "orchid", "porcelain", "aurora"];
var THEME_ALIASES = {
  nothing: "inscribed",
  "nothing-light": "chalk",
  void: "inscribed",
  monochrome: "inscribed",
  graphite: "carbon",
  terminal: "carbon",
  paper: "bone",
  hermes: "bone",
  "tokyo-night": "indigo",
  nord: "indigo",
  "cyber-matrix": "indigo",
  solar: "chalk"
};
var PREFS_KEY = "mj.editor.prefs";
function getEditorPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p2 = JSON.parse(raw);
      const stored = typeof p2.theme === "string" ? p2.theme : "";
      const theme = THEME_IDS.includes(stored) ? stored : THEME_ALIASES[stored] ?? "inscribed";
      return {
        snap: typeof p2.snap === "number" && p2.snap >= 0 ? p2.snap : 16,
        autosaveMs: typeof p2.autosaveMs === "number" && p2.autosaveMs >= 0 ? p2.autosaveMs : 1200,
        theme,
        showMinimap: p2.showMinimap !== false,
        showGrid: p2.showGrid !== false,
        reducedMotion: Boolean(p2.reducedMotion)
      };
    }
  } catch {
  }
  return { snap: 16, autosaveMs: 1200, theme: "inscribed", showMinimap: true, showGrid: true, reducedMotion: false };
}
var emptyGraph = (id, name) => ({
  schemaVersion: GRAPH_SCHEMA_VERSION,
  id,
  name,
  nodes: [],
  connections: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  groups: [],
  notes: []
});
function sanitizeGraph(g2) {
  const vp = g2.viewport ?? { x: 0, y: 0, zoom: 1 };
  const num = (v, d) => typeof v === "number" && Number.isFinite(v) ? v : d;
  return {
    ...g2,
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: Array.isArray(g2.nodes) ? g2.nodes.map((n2) => ({
      ...n2,
      x: num(n2.x, 80),
      y: num(n2.y, 80),
      inputs: Array.isArray(n2.inputs) ? n2.inputs : [],
      outputs: Array.isArray(n2.outputs) ? n2.outputs : [],
      reflection: n2.reflection && typeof n2.reflection === "object" ? {
        enabled: Boolean(n2.reflection.enabled),
        maxAttempts: Math.min(2, Math.max(1, Number(n2.reflection.maxAttempts) || 2)),
        passThreshold: Math.min(10, Math.max(1, Number(n2.reflection.passThreshold) || 7))
      } : { enabled: false, maxAttempts: 2, passThreshold: 7 }
    })) : [],
    connections: Array.isArray(g2.connections) ? g2.connections : [],
    viewport: { x: num(vp.x, 0), y: num(vp.y, 0), zoom: Math.min(2.4, Math.max(0.2, num(vp.zoom, 1))) },
    groups: Array.isArray(g2.groups) ? g2.groups : [],
    notes: Array.isArray(g2.notes) ? g2.notes : []
  };
}
var runtimeStatus = /* @__PURE__ */ new Map();
var nodeClipboard = [];
var useGraphStore = create((set, get) => {
  let saveTimer = null;
  const scheduleAutosave = () => {
    const { autosaveMs } = getEditorPrefs();
    if (autosaveMs <= 0) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().save();
    }, autosaveMs);
  };
  const withHistory = (label, mutate) => {
    const s = get();
    const next = structuredClone(s.graph);
    mutate(next);
    set({
      graph: next,
      dirty: true,
      past: [...s.past.slice(-99), { graph: s.graph, label }],
      future: []
    });
    scheduleAutosave();
  };
  return {
    workflowId: "",
    workflowName: "",
    description: "",
    graph: emptyGraph("", ""),
    dirty: false,
    past: [],
    future: [],
    selectedNodeId: null,
    inspectorId: null,
    selectedIds: [],
    lastSavedAt: null,
    loadWorkflow: (wf) => set({
      workflowId: wf.id,
      workflowName: wf.name,
      description: wf.description ?? "",
      graph: sanitizeGraph(wf.graph?.nodes ? wf.graph : emptyGraph(wf.id, wf.name)),
      dirty: false,
      past: [],
      future: [],
      selectedNodeId: null,
      inspectorId: null,
      selectedIds: []
    }),
    newWorkflow: (id, name) => set({
      workflowId: id,
      workflowName: name,
      description: "",
      graph: emptyGraph(id, name),
      dirty: false,
      past: [],
      future: [],
      selectedNodeId: null,
      inspectorId: null,
      selectedIds: []
    }),
    selectNode: (id) => set(id ? { selectedNodeId: id, selectedIds: [id] } : { selectedNodeId: null, inspectorId: null, selectedIds: [] }),
    /* V11.5 owner rule: single-click SELECTS, double-click OPENS DETAILS. */
    openDetails: (id) => set(id ? { inspectorId: id, selectedNodeId: id, selectedIds: [id] } : { inspectorId: null }),
    selectMany: (ids2) => set({
      selectedIds: ids2,
      selectedNodeId: ids2.length === 1 ? ids2[0] : ids2.length > 0 ? get().selectedNodeId && ids2.includes(get().selectedNodeId) ? get().selectedNodeId : ids2[ids2.length - 1] : null
    }),
    addNode: (definitionId, x, y) => {
      const def = DEFINITIONS_BY_ID.get(definitionId);
      if (!def) return null;
      const node = createNodeFromDef(def, uid("n"), x, y);
      withHistory(`Add ${def.title}`, (g2) => g2.nodes.push(node));
      set({ selectedNodeId: node.id, selectedIds: [node.id] });
      return node.id;
    },
    addNote: (x, y, text = "Note") => {
      const id = uid("note");
      withHistory("Add note", (g2) => {
        g2.notes = [...g2.notes ?? [], { id, x, y, w: 200, h: 120, text, color: "#C9A66B" }];
      });
      return id;
    },
    updateNote: (id, patch) => {
      set((s) => ({
        graph: {
          ...s.graph,
          notes: (s.graph.notes ?? []).map((n2) => n2.id === id ? { ...n2, ...patch } : n2)
        },
        dirty: true
      }));
      scheduleAutosave();
    },
    deleteNotes: (ids2) => withHistory("Delete notes", (g2) => {
      g2.notes = (g2.notes ?? []).filter((n2) => !ids2.includes(n2.id));
    }),
    insertTemplate: (instances2, wires2) => {
      if (instances2.length === 0) return 0;
      const byKey = new Map(instances2.map((n2) => [n2.templateKey, n2]));
      let connected = 0;
      withHistory("Load template", (g2) => {
        for (const n2 of instances2) g2.nodes.push({ ...n2 });
        for (const [sk, sp, tk, tp] of wires2) {
          const src = byKey.get(sk);
          const tgt = byKey.get(tk);
          if (!src || !tgt) continue;
          const findPort = (node, dir, key) => (dir === "input" ? node.inputs : node.outputs).find(
            (p2) => p2.id.toLowerCase() === key.toLowerCase() || p2.label.toLowerCase() === key.toLowerCase()
          );
          const spDef = findPort(src, "output", sp);
          const tpDef = findPort(tgt, "input", tp);
          if (!spDef || !tpDef) continue;
          if (!portsCompatible(spDef.dataType, tpDef.dataType)) continue;
          g2.connections.push({
            id: uid("c"),
            sourceNodeId: src.id,
            sourcePortId: spDef.id,
            targetNodeId: tgt.id,
            targetPortId: tpDef.id,
            dataType: spDef.dataType,
            status: "idle"
          });
          connected += 1;
        }
      });
      return connected;
    },
    updateNode: (id, patch) => withHistory("Edit node", (g2) => {
      const n2 = g2.nodes.find((x) => x.id === id);
      if (n2) Object.assign(n2, patch);
    }),
    updateNodeLive: (id, patch) => {
      set((s) => ({
        graph: {
          ...s.graph,
          nodes: s.graph.nodes.map((n2) => n2.id === id ? { ...n2, ...patch } : n2)
        },
        dirty: true
      }));
      scheduleAutosave();
    },
    moveNodes: (deltas) => {
      const byId = new Map(deltas.map((d) => [d.id, d]));
      set((s) => ({
        graph: {
          ...s.graph,
          nodes: s.graph.nodes.map((n2) => {
            const d = byId.get(n2.id);
            return d ? { ...n2, x: d.x, y: d.y } : n2;
          })
        },
        dirty: true
      }));
      scheduleAutosave();
    },
    moveNode: (id, x, y) => {
      get().moveNodes([{ id, x, y }]);
    },
    deleteNodes: (ids2) => withHistory("Delete nodes", (g2) => {
      g2.nodes = g2.nodes.filter((n2) => !ids2.includes(n2.id));
      g2.connections = g2.connections.filter((c) => !ids2.includes(c.sourceNodeId) && !ids2.includes(c.targetNodeId));
    }),
    duplicateNode: (id) => {
      const src = get().graph.nodes.find((n2) => n2.id === id);
      if (!src) return null;
      const copy = structuredClone(src);
      copy.id = uid("n");
      copy.title = `${src.title} copy`;
      copy.x += 40;
      copy.y += 40;
      withHistory("Duplicate node", (g2) => g2.nodes.push(copy));
      set({ selectedNodeId: copy.id, selectedIds: [copy.id] });
      return copy.id;
    },
    canConnect: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
      const g2 = get().graph;
      if (sourceNodeId === targetNodeId) return false;
      const src = g2.nodes.find((n2) => n2.id === sourceNodeId);
      const tgt = g2.nodes.find((n2) => n2.id === targetNodeId);
      if (!src || !tgt) return false;
      const sp = src.outputs.find((p2) => p2.id === sourcePortId);
      const tp = tgt.inputs.find((p2) => p2.id === targetPortId);
      if (!sp || !tp) return false;
      if (!portsCompatible(sp.dataType, tp.dataType)) return false;
      if (!tp.multiple && g2.connections.some((c) => c.targetNodeId === targetNodeId && c.targetPortId === targetPortId)) {
        return false;
      }
      const adj = new Map(g2.nodes.map((n2) => [n2.id, []]));
      for (const c of g2.connections) adj.get(c.sourceNodeId)?.push(c.targetNodeId);
      const stack = [targetNodeId];
      const seen = /* @__PURE__ */ new Set();
      while (stack.length) {
        const cur = stack.pop();
        if (cur === sourceNodeId) return false;
        for (const nx of adj.get(cur) ?? []) {
          if (!seen.has(nx)) {
            seen.add(nx);
            stack.push(nx);
          }
        }
      }
      return true;
    },
    connect: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
      if (!get().canConnect(sourceNodeId, sourcePortId, targetNodeId, targetPortId)) return false;
      const src = get().graph.nodes.find((n2) => n2.id === sourceNodeId);
      const sp = src.outputs.find((p2) => p2.id === sourcePortId);
      const conn = {
        id: uid("c"),
        sourceNodeId,
        sourcePortId,
        targetNodeId,
        targetPortId,
        dataType: sp.dataType,
        status: "idle"
      };
      withHistory("Connect", (g2) => g2.connections.push(conn));
      return true;
    },
    disconnect: (connectionId) => withHistory("Disconnect", (g2) => {
      g2.connections = g2.connections.filter((c) => c.id !== connectionId);
    }),
    setConnectionStatus: (connectionId, status) => set((s) => {
      const g2 = structuredClone(s.graph);
      const c = g2.connections.find((x) => x.id === connectionId);
      if (c) c.status = status;
      return { graph: g2 };
    }),
    setNodeStatus: (nodeId, status) => {
      runtimeStatus.set(nodeId, status);
      window.dispatchEvent(new CustomEvent(`mj:status:${nodeId}`));
    },
    setViewport: (vp) => {
      set((s) => ({ graph: { ...s.graph, viewport: { ...s.graph.viewport, ...vp } }, dirty: true }));
      scheduleAutosave();
    },
    undo: () => {
      const s = get();
      const prev = s.past.at(-1);
      if (!prev) return;
      set({
        graph: prev.graph,
        past: s.past.slice(0, -1),
        future: [{ graph: s.graph, label: prev.label }, ...s.future].slice(0, 100),
        dirty: true
      });
      scheduleAutosave();
    },
    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({
        graph: next.graph,
        past: [...s.past, { graph: s.graph, label: next.label }],
        future: s.future.slice(1),
        dirty: true
      });
      scheduleAutosave();
    },
    pasteNodes: () => {
      if (nodeClipboard.length === 0) return [];
      const created = [];
      withHistory("Paste nodes", (g2) => {
        for (const src of nodeClipboard) {
          const copy = structuredClone(src);
          copy.id = uid("n");
          copy.title = `${copy.title} copy`;
          copy.x += 40;
          copy.y += 40;
          g2.nodes.push(copy);
          created.push(copy.id);
        }
      });
      if (created.length > 0) set({ selectedNodeId: created[created.length - 1], selectedIds: [...created] });
      return created;
    },
    alignSelection: (mode) => {
      const ids2 = get().selectedIds;
      const nodes = get().graph.nodes.filter((n2) => ids2.includes(n2.id));
      if (nodes.length < 2) return;
      const xs = nodes.map((n2) => n2.x);
      const ys = nodes.map((n2) => n2.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const sortedX = [...nodes].sort((a, b) => a.x - b.x);
      const sortedY = [...nodes].sort((a, b) => a.y - b.y);
      withHistory(`Align ${mode}`, (g2) => {
        for (const n2 of g2.nodes) {
          if (!ids2.includes(n2.id)) continue;
          if (mode === "left") n2.x = minX;
          if (mode === "right") n2.x = maxX;
          if (mode === "top") n2.y = minY;
          if (mode === "bottom") n2.y = maxY;
          if (mode === "hcenter") n2.x = cx;
          if (mode === "vcenter") n2.y = cy;
        }
        if (mode === "hdist" && sortedX.length > 2) {
          const span = sortedX[sortedX.length - 1].x - sortedX[0].x;
          const step = span / (sortedX.length - 1);
          sortedX.forEach((n2, i) => {
            const t = g2.nodes.find((x) => x.id === n2.id);
            if (t) t.x = sortedX[0].x + step * i;
          });
        }
        if (mode === "vdist" && sortedY.length > 2) {
          const span = sortedY[sortedY.length - 1].y - sortedY[0].y;
          const step = span / (sortedY.length - 1);
          sortedY.forEach((n2, i) => {
            const t = g2.nodes.find((x) => x.id === n2.id);
            if (t) t.y = sortedY[0].y + step * i;
          });
        }
      });
    },
    autoLayout: () => {
      const g2 = get().graph;
      const indeg = new Map(g2.nodes.map((n2) => [n2.id, 0]));
      const adj = new Map(g2.nodes.map((n2) => [n2.id, []]));
      for (const c of g2.connections) {
        adj.get(c.sourceNodeId)?.push(c.targetNodeId);
        indeg.set(c.targetNodeId, (indeg.get(c.targetNodeId) ?? 0) + 1);
      }
      const layers = [];
      let frontier = g2.nodes.filter((n2) => (indeg.get(n2.id) ?? 0) === 0).map((n2) => n2.id);
      const placed = /* @__PURE__ */ new Set();
      while (frontier.length) {
        layers.push(frontier);
        frontier.forEach((id) => placed.add(id));
        const next = [];
        for (const id of layers[layers.length - 1]) {
          for (const nx of adj.get(id) ?? []) {
            if (placed.has(nx)) continue;
            const left = (indeg.get(nx) ?? 0) - 1;
            indeg.set(nx, left);
            if (left <= 0) next.push(nx);
          }
        }
        frontier = next.filter((id, i, a) => a.indexOf(id) === i);
        if (layers.length > 40) break;
      }
      for (const n2 of g2.nodes) if (!placed.has(n2.id)) layers.push([n2.id]);
      withHistory("Auto layout", (graph) => {
        layers.forEach((layer, i) => {
          layer.forEach((id, j) => {
            const n2 = graph.nodes.find((x) => x.id === id);
            if (n2) {
              n2.x = 80 + i * 320;
              n2.y = 80 + j * 200;
            }
          });
        });
      });
    },
    checkpoint: (label) => {
      const s = get();
      set({ past: [...s.past.slice(-99), { graph: structuredClone(s.graph), label }], future: [], dirty: true });
    },
    rename: (name) => {
      set((s) => ({
        workflowName: name,
        graph: { ...s.graph, name },
        dirty: true
      }));
      scheduleAutosave();
    },
    save: async () => {
      const s = get();
      if (!s.workflowId) return;
      try {
        await ipc.workflowSave(s.workflowId, s.workflowName, s.description, s.graph);
        set({ dirty: false, lastSavedAt: (/* @__PURE__ */ new Date()).toISOString() });
      } catch (e) {
        console.error("autosave failed", e);
      }
    }
  };
});

// probe/firstrun.test.ts
var before = useGraphStore.getState().graph.nodes.length;
var { instances, wires, skipped } = loadTemplate("code-test-review");
var added = useGraphStore.getState().insertTemplate(instances, wires);
var g = useGraphStore.getState().graph;
var pass = 0;
var fail = 0;
var ok = (c, m) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log("  FAIL " + m);
  }
};
ok(before === 0, `a fresh app really does boot empty (got ${before}) \u2014 this is why it looked broken`);
ok(skipped.length === 0, `no template step was skipped, got ${skipped.join(",")}`);
ok(added === 5, `all 5 nodes land on the canvas, got ${added}`);
ok(g.nodes.length === 5, `the store holds 5 nodes, got ${g.nodes.length}`);
ok(g.connections.length === 5, `all 5 wires connected, got ${g.connections.length}`);
var ids = new Set(g.nodes.map((n2) => n2.id));
for (const c of g.connections) {
  ok(ids.has(c.sourceNodeId) && ids.has(c.targetNodeId), `wire ${c.id} endpoints exist`);
  const s = g.nodes.find((n2) => n2.id === c.sourceNodeId);
  const t = g.nodes.find((n2) => n2.id === c.targetNodeId);
  ok(s.outputs.some((p2) => p2.id === c.sourcePortId), `wire ${c.id} source port exists on ${s.definitionId}`);
  ok(t.inputs.some((p2) => p2.id === c.targetPortId), `wire ${c.id} target port exists on ${t.definitionId}`);
}
ok(g.connections.every((c) => c.sourceNodeId !== c.targetNodeId), "no wire connects a node to itself");
var again = useGraphStore.getState().insertTemplate(instances, wires);
ok(again === 5, "a second insert is additive, not destructive");
ok(useGraphStore.getState().graph.nodes.length === 10, "duplicate detection is the caller's job, not insertTemplate's");
console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
