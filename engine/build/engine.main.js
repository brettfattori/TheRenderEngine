/**
 * The Render Engine
 * Engine Class
 *
 * @fileoverview The main engine class
 *
 * @author: Brett Fattori (brettf@renderengine.com)
 * @author: $Author: bfattori@gmail.com $
 * @version: $Revision: 1557 $
 *
 * Copyright (c) 2011 Brett Fattori (brettf@renderengine.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

/**
 * @class The main engine class which is responsible for keeping the world up to date.
 * Additionally, the Engine will track and display metrics for optimizing a game. Finally,
 * the Engine is responsible for maintaining the local client's <tt>worldTime</tt>.
 * <p/>
 * The engine includes methods to load scripts and stylesheets in a serialized fashion
 * and report on the sound engine status.  Since objects are tracked by the engine, a list
 * of all game objects can be obtained from the engine.  The engine also contains the root
 * rendering context, or "default" context.  For anything to be rendered, or updated by the
 * engine, it will need to be added to a child of the default context.
 * <p/>
 * Other methods allow for starting or shutting down then engine, toggling metric display,
 * setting of the base "frames per second", toggling of the debug mode, and processing of
 * the script and function queue.
 * <p/>
 * Since JavaScript is a single-threaded environment, frames are generated serially.  One
 * frame must complete before another can be rendered.  By default, if frames are missed,
 * the engine will wait until the next logical frame can be rendered.  The engine can also
 * run where it doesn't skip frames, and instead runs a constant frame clock.  This
 * doesn't guarantee that the engine will run at a fixed frame rate.
 *
 * @static
 */
R.Engine = Base.extend(/** @scope R.Engine.prototype */{
   version: "@ENGINE_VERSION",
   HOME_URL: "@HOME_URL",
   REF_NAME: "@REF_NAME",

   constructor: null,

   // Global engine options
   options: {},

   /*
    * Engine objects
    */
   idRef: 0,                  // Object reference Id
   gameObjects: {},           // Live objects cache
   timerPool: {},             // Pool of running timers
   livingObjects: 0,          // Count of live objects

   /*
    * Engine info
    */
   fpsClock: 16,              // The clock rate (ms)
   FPS: undefined,            // Calculated frames per second
   frameTime: 0,              // Amount of time taken to render a frame
   engineLocation: null,      // URI of engine
   defaultContext: null,      // The default rendering context
   debugMode: false,          // Global debug flag
   localMode: false,          // Local run flag
   started: false,            // Engine started flag
   running: false,            // Engine running flag
   shuttingDown: false,       // Engine is shutting down
   upTime: 0,                 // The startup time
   downTime: 0,               // The shutdown time
   skipFrames: true,          // Skip missed frames
   totalFrames: 0,
   droppedFrames: 0,
   pclRebuilds: 0,

   /*
    * Sound engine info
    */
   soundsEnabled: false,      // Sound engine enabled flag

   /**
    * The current time of the world on the client.  This time is updated
    * for each frame generated by the Engine.
    * @type {Number}
    * @memberOf R.Engine
    */
   worldTime: 0,              // The world time

   /** @private */
   lastTime: 0,               // The last timestamp the world was drawn

   /**
    * The number of milliseconds the engine has been running.  This time is updated
    * for each frame generated by the Engine.
    * @type {Number}
    * @memberOf R.Engine
    */
   liveTime: 0,               // The "alive" time (worldTime-upTime)

   /** @private */
   shutdownCallbacks: [],      // Methods to call when the engine is shutting down

   $GAME: null,               // Reference to the game object

   // Issue #18 - Intrinsic loading dialog
   loadingCSS: "<style type='text/css'>div.loadbox {width:325px;height:30px;padding:10px;font:10px Arial;border:1px outset gray;-moz-border-radius:10px;-webkit-border-radius:10px} #engine-load-progress { position:relative;border:1px inset gray;width:300px;height:5px} #engine-load-progress .bar {background:silver;}</style>",

   //====================================================================================================
   //====================================================================================================
   //                                      ENGINE PROPERTIES
   //====================================================================================================
   //====================================================================================================

   /**
    * Set/override the engine options.
    * @param opts {Object} Configuration options for the engine
    * @memberOf R.Engine
    * @private
    */
   setOptions: function(opts) {
      // Check for a "defaults" key
      var configOpts;
      if (opts.defaults) {
         configOpts = opts.defaults;
      }

      // See if the OS has a key
      var osOpts, platformDefaults, versionDefaults, platformVersions;
      if (opts["platforms"] && opts["platforms"][R.engine.Support.sysInfo().OS]) {
         // Yep, extract that one
         osOpts = opts["platforms"][R.engine.Support.sysInfo().OS];

         // Check for platform defaults
         if (osOpts && osOpts["defaults"]) {
            platformDefaults = osOpts["defaults"];
         }
      }

      // Check for general version options
      if (opts["versions"]) {
         versionDefaults = {};
         for (var v in opts["versions"]) {
            if (R.engine.Support.sysInfo().version == v) {
               // Add version specific matches
               versionDefaults = $.extend(versionDefaults, opts["versions"][v]);
            }

            if (parseFloat(R.engine.Support.sysInfo().version) >= parseFloat(v)) {
               // Add version match options
               versionDefaults = $.extend(versionDefaults, opts["versions"][v]);
            }
         }
      }

      // Finally, check the OS for version options
      if (osOpts && osOpts["versions"]) {
         platformVersions = {};
         for (var v in osOpts["versions"]) {
            if (R.engine.Support.sysInfo().version == v) {
               // Add  version specific options
               platformVersions = $.extend(platformVersions, osOpts["versions"][v]);
            }

            if (parseFloat(R.engine.Support.sysInfo().version) >= parseFloat(v)) {
               // Add version match options
               platformVersions = $.extend(platformVersions, osOpts["versions"][v]);
            }
         }
      }

      $.extend(R.Engine.options, configOpts, platformDefaults, versionDefaults, platformVersions);
   },

   /**
    * Set the debug mode of the engine.  Engine debugging enables helper objects
    * which visually assist in debugging game objects.  To specify the console debug
    * message output level, see {@link R.debug.Console@setDebuglevel}.
    * <p/>
    * Engine debug helper objects include:
    * <ul>
    * <li>A left/up glyph at the origin of objects using the {@link R.components.Transform2D} component</li>
    * <li>Yellow outline in the shape of the collision hull of {@link R.engine.Object2D}, if assigned</li>
    * <li>Yellow outline around objects using box or circle collider components</li>
    * <li>Green outline around objects which are rendered with the {@link R.components.Billboard2D} component</li>
    * <li>Blue outline around box and circle rigid body objects</li>
    * <li>Red lines from anchor points in jointed {@link R.objects.PhysicsActor} objects</li>
    * </ul>
    *
    * @param mode {Boolean} <tt>true</tt> to enable debug mode
    * @memberOf R.Engine
    */
   setDebugMode: function(mode) {
      R.Engine.debugMode = mode;
   },

   /**
    * Query the debugging mode of the engine.
    *
    * @return {Boolean} <tt>true</tt> if the engine is in debug mode
    * @memberOf R.Engine
    */
   getDebugMode: function() {
      return R.Engine.debugMode;
   },

   /**
    * Returns <tt>true</tt> if SoundManager2 is loaded and initialized
    * properly.  The resource loader and play manager will use this
    * value to execute properly.
    * @return {Boolean} <tt>true</tt> if the sound engine was loaded properly
    * @memberOf R.Engine
    */
   isSoundEnabled: function() {
      return R.Engine.soundsEnabled;
   },

   /**
    * Set the FPS (frames per second) the engine runs at.  This value
    * is mainly a suggestion to the engine as to how fast you want to
    * redraw frames.  If frame execution time is long, frames will be
    * processed as time is available. See the metrics to understand
    * available time versus render time.
    *
    * @param fps {Number} The number of frames per second to refresh
    *                     Engine objects.
    * @memberOf R.Engine
    */
   setFPS: function(fps) {
      Assert((fps != 0), "You cannot have a framerate of zero!");
      R.Engine.fpsClock = Math.floor(1000 / fps);
      R.Engine.FPS = undefined;
   },

   /**
    * Get the FPS (frames per second) the engine is set to run at.
    * @return {Number}
    * @memberOf R.Engine
    */
   getFPS: function() {
      if (!R.Engine.FPS) {
         R.Engine.FPS = Math.floor((1 / R.Engine.fpsClock) * 1000);
      }
      return R.Engine.FPS;
   },

   /**
    * Get the actual FPS (frames per second) the engine is running at.
    * This value will vary as load increases or decreases due to the
    * number of objects being rendered.  A faster machine will be able
    * to handle a higher FPS setting.
    * @return {Number}
    * @memberOf R.Engine
    */
   getActualFPS: function() {
      return Math.floor((1 / R.Engine.frameTime) * 1000);
   },

   /**
    * Get the amount of time allocated to draw a single frame.
    * @return {Number} Milliseconds allocated to draw a frame
    * @memberOf R.Engine
    */
   getFrameTime: function() {
      return R.Engine.fpsClock;
   },

   /**
    * Get the amount of time it took to draw the last frame.  This value
    * varies per frame drawn, based on visible objects, number of operations
    * performed, and other factors.  The draw time can be used to optimize
    * your game for performance.
    * @return {Number} Milliseconds required to draw the frame
    * @memberOf R.Engine
    */
   getDrawTime: function() {
      return R.Engine.frameTime;
   },

   /**
    * Get the load the currently rendered frame is putting on the engine.
    * The load represents the amount of
    * work the engine is doing to render a frame.  A value less
    * than one indicates the the engine can render a frame within
    * the amount of time available.  Higher than one indicates the
    * engine cannot render the frame in the time available.
    * <p/>
    * Faster machines will be able to handle more load.  You can use
    * this value to gauge how well your game is performing.
    * @return {Number}
    * @memberOf R.Engine
    */
   getEngineLoad: function () {
      return (R.Engine.frameTime / R.Engine.fpsClock);
   },

   /**
    * Get the default rendering context for the Engine.  This
    * is the <tt>document.body</tt> element in the browser.
    *
    * @return {RenderContext} The default rendering context
    * @memberOf R.Engine
    */
   getDefaultContext: function() {
      if (R.Engine.defaultContext == null) {
         R.Engine.defaultContext = R.rendercontexts.DocumentContext.create();
      }

      return R.Engine.defaultContext;
   },

   /**
    * Override the engine's default context.  The engine will use
    * the {@link R.rendercontexts.DocumentContext} as the default context,
    * unless otherwise specified.
    * @param defaultContext {R.rendercontexts.AbstracRenderContext} The context to use as the start of the
    *      scene graph.
    * @memberOf R.Engine
    */
   setDefaultContext: function(defaultContext) {
      Assert(defaultContext instanceof R.rendercontexts.AbstractRenderContext, "Setting default engine context to object which is not a render context!");
      R.Engine.defaultContext = defaultContext;
   },

   /**
    * Get the game object that has been loaded by the engine.  The game object isn't valid until the game is loaded.
    * @return {R.engine.Game}
    */
   getGame: function() {
      return R.Engine.$GAME;
   },

   /**
    * Get the path to the engine.  Uses the location of the <tt>/runtime/engine.js</tt>
    * file that was initially loaded to determine the URL where the engine is running from.
    * When files are included, or classes are loaded, they are loaded relative to the engine's
    * location on the server.
    *
    * @return {String} The path/URL where the engine is located
    * @memberOf R.Engine
    */
   getEnginePath: function() {
      if (R.Engine.engineLocation == null) {
         // Determine the path of the "engine.js" file
         var head = document.getElementsByTagName("head")[0];
         var scripts = head.getElementsByTagName("script");
         for (var x = 0; x < scripts.length; x++) {
            var src = scripts[x].src;
            var m = src.match(/(.*\/engine)\/runtime\/engine\.js/);
            if (src != null && m) {
               // Get the path
               R.Engine.engineLocation = m[1];
               break;
            }
         }
      }

      return R.Engine.engineLocation;
   },

   //====================================================================================================
   //====================================================================================================
   //                                  GLOBAL OBJECT MANAGEMENT
   //====================================================================================================
   //====================================================================================================

   /**
    * Create an instance of an object within the Engine and get a unique Id for it.
    * This is called by any object that extends from {@link R.engine.PooledObject}.
    *
    * @param obj {R.engine.PooledObject} An object within the engine
    * @return {String} The global Id of the object
    * @memberOf R.Engine
    */
   create: function(obj) {
      if (R.Engine.shuttingDown === true) {
         R.debug.Console.warn("Engine shutting down, '" + obj + "' destroyed because it would create an orphaned reference");
         obj.destroy();
         return null;
      }

      Assert((R.Engine.started === true), "Creating an object when the engine is stopped!", obj);

      R.Engine.idRef++;
      var objId = obj.getName() + R.Engine.idRef;
      R.debug.Console.log("CREATED Object ", objId, "[", obj, "]");
      R.Engine.livingObjects++;

      return objId;
   },

   /**
    * Destroys an object instance within the Engine.
    *
    * @param obj {R.engine.PooledObject} The object, managed by the engine, to destroy
    * @memberOf R.Engine
    */
   destroy: function(obj) {
      if (obj == null) {
         R.debug.Console.warn("NULL reference passed to Engine.destroy()!  Ignored.");
         return;
      }

      var objId = obj.getId();
      R.debug.Console.log("DESTROYED Object ", objId, "[", obj, "]");
      R.Engine.livingObjects--;
   },

   /**
    * Add a timer to the pool so it can be cleaned up when
    * the engine is shutdown, or paused when the engine is
    * paused.
    * @param timerName {String} The timer name
    * @param timer {R.lang.Timer} The timer to add
    * @memberOf R.Engine
    */
   addTimer: function(timerName, timer) {
      R.Engine.timerPool[timerName] = timer;
   },

   /**
    * Remove a timer from the pool when it is destroyed.
    * @param timerName {String} The timer name
    * @memberOf R.Engine
    */
   removeTimer: function(timerName) {
      R.Engine.timerPool[timerName] = null;
      delete R.Engine.timerPool[timerName];
   },

   /**
    * Get an object by the Id that was assigned during the call to {@link #create}.
    * Only objects that are contained within other objects will be found.  Discreetly
    * referenced objects cannot be located by Id.
    *
    * @param id {String} The Id of the object to locate
    * @return {R.engine.PooledObject} The object
    * @memberOf R.Engine
    */
   getObject: function(id) {
      function search(container) {
         var itr = container.iterator();
         while (itr.hasNext()) {
            var obj = itr.next();
            if (obj.getId && (obj.getId() === id)) {
               itr.destroy();
               return obj;
            }
            if (obj instanceof R.struct.Container) {
               // If the object is a container, search inside of it
               return search(obj);
            }
         }
         itr.destroy();
         return null;
      }

      // Start at the engine's default context
      return search(R.Engine.getDefaultContext());
   },

   //====================================================================================================
   //====================================================================================================
   //                                    ENGINE PROCESS CONTROL
   //====================================================================================================
   //====================================================================================================

   /**
    * Load the minimal scripts required for the engine to start.
    * @private
    * @memberOf R.Engine
    */
   loadEngineScripts: function() {
      // Engine stylesheet
      R.engine.Script.loadStylesheet("/css/engine.css");

      // The basics needed by the engine to get started
      R.engine.Linker._doLoad("R.engine.Game");
      R.engine.Linker._doLoad("R.engine.PooledObject");
      R.engine.Linker._doLoad("R.lang.Iterator");
      R.engine.Linker._doLoad("R.rendercontexts.AbstractRenderContext");
      R.engine.Linker._doLoad("R.rendercontexts.RenderContext2D");
      R.engine.Linker._doLoad("R.rendercontexts.HTMLElementContext");
      R.engine.Linker._doLoad("R.rendercontexts.DocumentContext");

      // Load the timers so that we don't require developers to do it
      R.engine.Linker._doLoad("R.lang.AbstractTimer");
      R.engine.Linker._doLoad("R.lang.IntervalTimer");
      R.engine.Linker._doLoad("R.lang.MultiTimeout");
      R.engine.Linker._doLoad("R.lang.OneShotTimeout");
      R.engine.Linker._doLoad("R.lang.OneShotTrigger");
      R.engine.Linker._doLoad("R.lang.Timeout");
   },

   /**
    * Starts the engine and loads the basic engine scripts.  When all scripts required
    * by the engine have been loaded the {@link #run} method will be called.
    *
    * @param debugMode {Boolean} <tt>true</tt> to set the engine into debug mode
    *                            which allows the output of messages to the console.
    * @memberOf R.Engine
    */
   startup: function(debugMode) {
      Assert((R.Engine.running == false), "An attempt was made to restart the engine!");

      // Check for supported browser
      if (!R.Engine.browserSupportCheck()) {
         return false;
      }

      R.Engine.upTime = R.now();
      //R.Engine.debugMode = debugMode ? true : false;
      R.Engine.started = true;
      R.Engine.totalFrames = 0;

      // Load the required scripts
      R.Engine.loadEngineScripts();
      return true;
   },

   /**
    * Starts or resumes the engine.  This will be called after all scripts have been loaded.
    * You will also need to call this if you {@link #pause} the engine.  Any paused timers
    * will also be resumed.
    * @memberOf R.Engine
    */
   run: function() {
      if (R.Engine.shuttingDown || R.Engine.running) {
         return;
      }

      // Restart all of the timers
      for (var tm in R.Engine.timerPool) {
         R.Engine.timerPool[tm].restart();
      }

      var mode = "[";
      mode += (R.Engine.debugMode ? "DEBUG" : "");
      mode += (R.Engine.localMode ? (mode.length > 0 ? " LOCAL" : "LOCAL") : "");
      mode += "]";
      R.debug.Console.warn(">>> Engine started. " + (mode != "[]" ? mode : ""));
      R.Engine.running = true;
      R.Engine.shuttingDown = false;

      R.debug.Console.debug(">>> sysinfo: ", R.engine.Support.sysInfo());

      R.Engine._pauseTime = R.now();
      R.Engine._stepOne = 0;
      R.Engine.lastTime = R.now() - R.Engine.fpsClock;

      // Start world timer
      R.Engine.engineTimer();
   },

   /**
    * Steps the engine when paused.  Any timers that were paused, stay paused while stepping.
    * @memberOf R.Engine
    */
   step: function() {
      if (R.Engine.running) {
         // Need to pause the engine to step
         return;
      }

      R.Engine._stepOne = 1;
      R.Engine.engineTimer();
   },

   /**
    * Pauses the engine and any running timers.
    * @memberOf R.Engine
    */
   pause: function() {
      if (R.Engine.shuttingDown) {
         return;
      }

      // Pause all of the timers
      R.debug.Console.debug("Pausing all timers");
      for (var tm in R.Engine.timerPool) {
         R.Engine.timerPool[tm].pause();
      }

      R.debug.Console.warn(">>> Engine paused <<<");
      window.clearTimeout(R.Engine.globalTimer);
      R.Engine.running = false;
      R.Engine._pauseTime = R.now();
   },

   /**
    * Add a method to be called when the engine is being shutdown.  Use this
    * method to allow an object, which is not referenced by the engine, to
    * perform cleanup actions.
    *
    * @param fn {Function} The callback function
    * @memberOf R.Engine
    */
   onShutdown: function(fn) {
      if (R.Engine.shuttingDown === true) {
         return;
      }

      R.Engine.shutdownCallbacks.push(fn);
   },

   /**
    * Shutdown the engine.  Stops the global timer and cleans up (destroys) all
    * objects that have been created and added to the engine, starting at the default
    * engine context.
    * @memberOf R.Engine
    */
   shutdown: function() {
      if (R.Engine.shuttingDown) {
         // Prevent another shutdown
         return;
      }

      R.Engine.shuttingDown = true;

      if (!R.Engine.running && R.Engine.started) {
         // If the engine is not currently running (i.e. paused) 
         // restart it and then re-perform the shutdown
         R.Engine.running = true;
         setTimeout(function() {
            R.Engine.shutdown();
         }, (R.Engine.fpsClock * 2));
         return;
      }

      R.Engine.started = false;
      R.debug.Console.warn(">>> Engine shutting down...");

      // Stop world timer
      R.global.clearTimeout(R.Engine.globalTimer);

      // Run through shutdown callbacks to allow unreferenced objects
      // to clean up references, etc.
      while (R.Engine.shutdownCallbacks.length > 0) {
         R.Engine.shutdownCallbacks.shift()();
      }

      if (R.Engine.metricDisplay) {
         R.Engine.metricDisplay.remove();
         R.Engine.metricDisplay = null;
      }

      // Cancel all of the timers
      R.debug.Console.debug(">>> Cancelling all timers");
      for (var tm in R.Engine.timerPool) {
         R.Engine.timerPool[tm].cancel();
      }
      R.Engine.timerPool = {};

      R.Engine.downTime = R.now();
      R.debug.Console.warn(">>> Engine stopped.  Runtime: " + (R.Engine.downTime - R.Engine.upTime) + "ms");
      R.debug.Console.warn(">>>   frames generated: ", R.Engine.totalFrames);

      R.Engine.running = false;

      // Kill off the default context and anything
      // that's attached to it.  We'll alert the
      // developer if there's an issue with orphaned objects
      R.Engine.getDefaultContext().destroy();

      // Dump the object pool
      R.engine.PooledObject.objectPool = null;

      AssertWarn((R.Engine.livingObjects == 0), "Object references were not cleaned up!");

      R.Engine.loadedScripts = {};
      R.Engine.scriptLoadCount = 0;
      R.Engine.scriptsProcessed = 0;
      R.Engine.defaultContext = null;

      // Shutdown complete
      R.Engine.shuttingDown = false;
   },

   /**
    * See {@link #define} instead.
    * @deprecated
    * @memberOf R.Engine
    */
   initObject: function(objectName, primaryDependency, fn) {
      throw new Error("Unsupported - See R.Engine.define() instead");
   },

   /**
    * Defines a new class.  The format of the object definition is:
    * <pre>
    * R.Engine.define({
    *    "class": "[class name]",
    *    "requires": [
    *       "R.[package name].[dependency]"
    *    ],
    *    "depends": [
    *       "[dependency]"
    *    ],
    *    "includes": [
    *       "/path/to/file.js"
    *    ]
    * });
    * </pre>
    * Each class must define its class name via the "class" key.  This is the name that
    * other classes will use to locate the class object.  The <tt>"requires"</tt> key defines the
    * classes within the engine that the class is dependent upon.  Anything that falls into
    * the <tt>"R."</tt> namespace should be declared as a requirement here. The "requires" key
    * performs class loading for these objects automatically.  In other words, you do not need
    * to load classes which start with <tt>"R."</tt>.
    * <p/>
    * If your class has dependencies on classes <i>not defined in the <tt>"R"</tt> namespace</i>,
    * they should be declared via the <tt>"depends"</tt> array.  These are classes which your game
    * classes need to load via {@link R.engine.Game#load} calls.  For files which just need to be
    * loaded, use the <tt>"include"</tt> key to tell the engine where the file is.
    * <p/>
    * Until all requirements, dependencies, and included files have been loaded and/or initialized,
    * a class will, itself, not be initialized. Be aware of class dependencies so you do not create
    * circular dependencies.  First-level circular dependencies are okay, such as <tt>A</tt> requires
    * <tt>B</tt>, while <tt>B</tt> requires <tt>A</tt>.  But second, third, and so on circular
    * dependencies will cause your classes to remain unresolved. The engine will not start the game,
    * and an erro message will be sent to the console listing classes which were resolved and those
    * which are unresolved.
    * <p/>
    * The <tt>"requires"</tt>, <tt>"includes"</tt> and <tt>"depends"</tt> keys are optional.  You
    * can either omit them entirely, set them to <code>null</code>, or assign an empty array to them.
    * <p/>
    * The <tt>"depends"</tt> key is the only way your game classes can establish class dependencies
    * which are <i>not in the <tt>"R."</tt> namespace</i>.  Classes specified via the
    * <tt>"depends"</tt> key are not loaded via the engine class loader like <tt>"requires"</tt>
    * does.  Instead, your game will need to load the classes.  For example:
    * <pre>
    * R.Engine.define({
    *    "class": "Foo",
    *    "requires": [
    *       "R.rendercontexts.CanvasContext"
    *    ],
    *    "depends": [
    *       "Bar"
    *    ]
    * });
    *
    * // Load the Bar class
    * R.engine.Game.load("bar.js");
    * </pre>
    * After receiving the definition, the engine will load <tt>R.rendercontexts.CanvasContext</tt>
    * for <tt>Foo</tt>. The call to <code>R.engine.Game.load("bar.js")</code> would load the
    * <tt>Bar</tt> class.  When the context and <tt>Bar</tt> have loaded and initialized, <tt>Foo</tt>
    * can be initialized which will enable any classes dependent on <tt>Foo</tt> to be initialized.
    *
    * @param classDef {Object} The object's definition
    * @memberOf R.Engine
    */
   define: function(classDef) {
      R.engine.Linker.define(classDef);
   },

   /**
    * Check the current browser to see if it is supported by the
    * engine.  If it isn't, there's no reason to load the remainder of
    * the engine.  This check can be disabled with the <tt>disableBrowserCheck</tt>
    * query parameter set to <tt>true</tt>.
    * <p/>
    * If the browser isn't supported, the engine is shutdown and a message is
    * displayed.
    * @memberOf R.Engine
    * @private
    */
   browserSupportCheck: function() {
      if (R.engine.Support.checkBooleanParam("disableBrowserCheck")) {
         return true;
      }
      var sInfo = R.engine.Support.sysInfo();
      var msg = "This browser is not currently supported by <i>" + R.Engine.REF_NAME + "</i>.<br/><br/>";
      msg += "Please go <a href='" + R.Engine.HOME_URL + "' target='_blank'>here</a> for more information.";
      switch (sInfo.browser) {
         case "iPhone":
         case "android":
         case "msie":
         case "chrome":
         case "Wii":
         case "safari":
         case "safarimobile":
         case "mozilla":
         case "firefox":
         case "opera":
            return true;
         default:
            R.debug.Console.warn("Unsupported Browser");
            $("body", document).empty().append($("<div style='font:12pt Arial,sans-serif;'>").html(msg));
            return false;
      }
   },

   /**
    * Prints the version of the engine.
    * @memberOf R.Engine
    */
   toString: function() {
      return "The Render Engine " + R.Engine.version;
   },

   //====================================================================================================
   //====================================================================================================
   //                                        THE WORLD TIMER
   //====================================================================================================
   //====================================================================================================

   /**
    * This is the process which updates the world.  It starts with the default
    * context, telling it to update itself.  Since each context is a container,
    * all of the objects in the container will be called to update, and then
    * render themselves.
    *
    * @private
    * @memberOf R.Engine
    */
   engineTimer: function() {
      if (R.Engine.shuttingDown) {
         return;
      }

      if (!R.Engine.running && R.Engine._stepOne == 0) {
         // Not stepping, done here
         return;
      }

      var nextFrame = R.Engine.fpsClock;

      // Update the world
      if ((R.Engine._stepOne == 1 || R.Engine.running) && R.Engine.getDefaultContext() != null) {
         R.Engine.vObj = 0;
         R.Engine.rObjs = 0;
         //R.Engine.pclRebuilds = 0;

         // Render a frame
         R.Engine.worldTime = R.Engine._stepOne == 1 ? R.Engine._pauseTime : R.now();
         R.Engine.lastTime = R.Engine._stepOne == 1 ? R.Engine.worldTime - R.Engine.fpsClock : R.Engine.lastTime;

         // Pass parent context, world time, delta time
         R.Engine.getDefaultContext().update(null, R.Engine.worldTime, R.Engine.worldTime - R.Engine.lastTime);
         R.Engine.lastTime = R.Engine.worldTime;
         R.Engine.frameTime = R.now() - R.Engine.worldTime;

         if (R.Engine._stepOne == 1) {
            R.Engine._pauseTime += R.Engine.frameTime;
         }

         R.Engine.liveTime = R.Engine.worldTime - R.Engine.upTime;

         // Count the number of frames generated
         R.Engine.totalFrames++;

         // Determine when the next frame should draw
         // If we've gone over the allotted time, wait until the next available frame
         var f = nextFrame - R.Engine.frameTime;
         nextFrame = (R.Engine.skipFrames ? (f > 0 ? f : nextFrame) : R.Engine.fpsClock);
         R.Engine.droppedFrames += (f <= 0 ? Math.round((f * -1) / R.Engine.fpsClock) : 0);

         // Update the metrics display
         R.Engine.doMetrics();
      }

      if (R.Engine._stepOne == 1) {
         // If stepping, don't re-call the engine timer automatically
         R.Engine._stepOne = 0;
         return;
      }

      // When the process is done, start all over again
      if (R.Engine.options.nativeAnimationFrame) {
         R.global.nativeFrame(R.Engine.engineTimer /*, R.Engine.getDefaultContext().getSurface()*/);
      } else {
         R.Engine.globalTimer = setTimeout(function _engineTimer() {
            R.Engine.engineTimer();
         }, nextFrame);
      }
   },

   /**
    * @private
    */
   doMetrics: function() {
      if (R.debug && R.debug.Metrics) {
         R.debug.Metrics.doMetrics();
      }
   },

   // ======================================================
   // References to R.engine.Script methods
   // ======================================================

   /**
    * Include a script file.
    *
    * @param scriptURL {String} The URL of the script file
    * @memberOf R.Engine
    */
   include: function(scriptURL) {
      R.engine.Script.include(scriptURL);
   },

   /**
    * Loads a game's script.  This will wait until the specified
    * <tt>gameObjectName</tt> is available before running it.  Doing so will
    * ensure that all dependencies have been resolved before starting a game.
    * Also creates the default rendering context for the engine.
    * <p/>
    * All games should execute this method to start their processing, rather than
    * using the script loading mechanism for engine or game scripts.  This is used
    * for the main game script only.  Normally it would appear in the game's "index" file.
    * <pre>
    *  &lt;script type="text/javascript"&gt;
    *     // Load the game script
    *     Engine.loadGame('game.js','Spaceroids');
    *  &lt;/script&gt;
    * </pre>
    *
    * @param gameSource {String} The URL of the game script.
    * @param gameObjectName {String} The string name of the game object to execute.  When
    *                       the framework if ready, the <tt>startup()</tt> method of this
    *                       object will be called.
    * @param [gameDisplayName] {String} An optional string to display in the loading dialog
    * @memberOf R.Engine
    */
   loadGame: function(gameSource, gameObjectName, gameDisplayName) {
      R.engine.Script.loadGame(gameSource, gameObjectName, gameDisplayName);
   }

}, { // Interface
   /** @private */
   globalTimer: null
});

