/**
 * The Render Engine
 * BillboardComponent
 *
 * @fileoverview A render component which will render the contents of
 *               a generated image until the contents are updated.
 *
 * @author: Brett Fattori (brettf@renderengine.com)
 * @author: $Author: bfattori $
 * @version: $Revision: 1556 $
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

// The class this file defines and its required classes
R.Engine.define({
   "class": "R.components.render.Billboard2D",
   "requires": [
      "R.components.Render",
      "R.util.RenderUtil",
      "R.text.AbstractTextRenderer",
      "R.math.Point2D"
   ]
});

/**
 * @class The billboard component renders the contents of an image which
 *        was generated by a linked render component.  When the contents
 *        of the linked component are re-rendered, the contents of the
 *        image are updated.  The best usage of this component is for infrequently
 *        changing vector drawn objects.  For example:
 *        <pre>
 *     // Add component to draw the object
 *     this.add(R.components.Billboard2D.create("draw", R.components.Vector2D.create("vector")));
 *        </pre>
 *        Accessing the <tt>R.components.Vector2D</tt> within the <tt>R.components.Billboard2D</tt>
 *        is as simple as calling {@link #getComponent}.  If the contents of the linked
 *        component are updated, you will need to call {@link #regenerate} to recreate the
 *        billboard image.
 *
 *
 * @param name {String} The name of the component
 * @param renderComponent {R.components.Render} A render component to create the billboard from
 * @param priority {Number} The priority of the component between 0.0 and 1.0
 * @constructor
 * @extends R.components.Render
 * @description Creates a 2d billboard component.
 */
R.components.render.Billboard2D = function() {
   return R.components.Render.extend(/** @scope R.components.render.Billboard2D.prototype */{

      billboard: null,
      mode: null,
      renderComponent: null,
      hostRect: null,

      /**
       * @private
       */
      constructor: function(name, renderComponent, priority) {
         Assert(renderComponent instanceof R.components.Render ||
               renderComponent instanceof R.text.AbstractTextRenderer, "Attempt to assign a non-render component to a billboard component");
         this.base(name, priority || 0.1);
         this.mode = R.components.render.Billboard2D.REDRAW;
         this.renderComponent = renderComponent;

      },

      /**
       * Destroy the object
       */
      destroy: function() {
         this.renderComponent.destroy();
         this.base();
      },

      /**
       * Releases the component back into the object pool. See {@link R.engine.PooledObject#release}
       * for more information.
       */
      release: function() {
         this.base();
         this.mode = null;
         this.renderComponent = null;
      },

      /**
       * Deprecated in favor of {@link #setGameObject}.
       * @deprecated
       */
      setHostObject: function(hostObject) {
         this.setGameObject(hostObject);
      },

      /**
       * Establishes the link between this component and its game object.
       * When you assign components to a game object, it will call this method
       * so that each component can refer to its game object, the same way
       * a game object can refer to a component with {@link R.engine.GameObject#getComponent}.
       *
       * @param hostObject {R.engine.GameObject} The object which hosts this component
       */
      setGameObject: function(gameObject) {
         this.renderComponent.setGameObject(gameObject);
         this.base(gameObject);
      },

      /**
       * Call this method when the linked render component has been updated
       * to force the billboard to be redrawn.
       */
      regenerate: function() {
         this.mode = R.components.render.Billboard2D.REDRAW;
         this.hostRect = null;
         this.getGameObject().markDirty();
      },

      /**
       * Get the linked render component.
       * @return {R.components.Render}
       */
      getComponent: function() {
         return this.renderComponent;
      },

      /**
       * Draws the contents of the billboard to the render context.  This
       * component operates in one of two modes.  When the contents of the
       * subclassed component are redrawing, a temporary render context is created
       * to which the component renders.  The second mode is where the contents
       * of the context from the first mode are rendered instead of performing
       * all of the operations required to render the component.  This component
       * is only good if the contents don't change often.
       *
       * @param renderContext {R.rendercontexts.AbstractRenderContext} The rendering context
       * @param time {Number} The engine time in milliseconds
       * @param dt {Number} The delta between the world time and the last time the world was updated
       *          in milliseconds.
       */
      execute: function(renderContext, time, dt) {
         if (!this.base(renderContext, time, dt)) {
            return;
         }

         // Get the host object's bounding box
         var hostBox = this.getGameObject().getBoundingBox();
         var o = R.math.Point2D.create(this.getGameObject().getOrigin());

         if (this.mode == R.components.render.Billboard2D.REDRAW) {
            // We'll match the type of context the component is rendering to
            //var ctx = this.getGameObject().getRenderContext().constructor;

            if (!this.billboard) {
               // Due to pooling, we don't need to recreate this each time
               this.billboard = $("<img/>");
            }

            this.billboard.attr({
               "src": R.util.RenderUtil.renderComponentToImage(R.rendercontexts.CanvasContext, this.renderComponent,
                       hostBox.w, hostBox.h, null, o),
               "width": hostBox.w,
               "height": hostBox.h
            });

            this.mode = R.components.render.Billboard2D.NORMAL;
         }

         // Render the billboard.  If the bounding box's origin is negative in
         // either X or Y, we'll need to move the transformation there before rendering the object
         this.transformOrigin(renderContext, true);
         try {
            renderContext.drawImage(this.getGameObject().getBoundingBox(), this.billboard[0], this.getGameObject());
         }
         catch (ex) {
            // TODO: Find a better way to perform this operation since try/catch is SLOW
            // It appears that Firefox might not have a full image rendered, so calling
            // drawImage fails with a component exception.  To abate this possible issue,
            // we try the call and catch the failure...
         }

         /* pragma:DEBUG_START */
         // Debug the billboard image box
         if (R.Engine.getDebugMode()) {
            renderContext.setLineStyle("green");
            renderContext.drawRectangle(this.getGameObject().getBoundingBox(), this.getGameObject());
         }
         /* pragma:DEBUG_END */

         this.transformOrigin(renderContext, false);
         o.destroy();
      }

   }, /** @scope R.components.render.Billboard2D.prototype */{

      /**
       * Get the class name of this object
       *
       * @return {String} "R.components.render.Billboard2D"
       */
      getClassName: function() {
         return "R.components.render.Billboard2D";
      },

      /**
       * The component will render to a temporary context from which the
       * actual content will be rendered.
       * @type {Number}
       */
      REDRAW: 0,

      /**
       * The component will render the contents of the billboard.
       * @type {Number}
       */
      NORMAL: 1,

      /**
       * A temporary context to which all billboards will render their
       * bitmaps.
       * @private
       */
      tempContext: null

   });
};