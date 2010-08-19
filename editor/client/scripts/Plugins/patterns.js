/**
 * Copyright (c) 2010
 *
 * Kai Höwelmeyer
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 **/

/**
 * @namespace Oryx name space for plugins
 * @name ORYX.Plugins
 */
if(!ORYX.Plugins)
	ORYX.Plugins = {};
		
/**
 * Patterns plugin adds support for a pattern repository that contains composite shapes.
 * @class ORYX.Plugins.Patterns
 * @extends ORYX.Plugins.AbstractPlugin
 * @param facade
 */
ORYX.Plugins.Patterns = ORYX.Plugins.AbstractPlugin.extend(
	/** @lends ORYX.Plugins.prototype */
	{
	
	/**
	 * facade that provides uniform access to core functions
	 */
	facade : undefined,
	
	/**
	 * indicicates if the "make as pattern" button besides a selection is visible
	 */
	buttonVisible : false,
	
	/**
	 * button that appears besides a selection of 2 or more shapes
	 */
	button : undefined,
	
	/**
	 * repository of patterns for the current stencilset (ORYX.Plugins.Patterns.PatternRepository)
	 */
	patternRepos : undefined,
	
	/**
	 * Ext.tree.TreeNode that represents the root of the pattern repository / panel.
	 */
	patternRoot : undefined,
	
	/**
	 * Ext.tree.TreePanel that represents the pattern panel / pattern repository in the west region.
	 */
	patternPanel : undefined,
	
	/**
	 * @constructs
	 */
	construct: function(facade) {  //TODO split in construct and initialize phase!
		
		/** call superclass constructor */
		arguments.callee.$.construct.apply(this, arguments);
		
		this.facade.registerOnEvent(ORYX.CONFIG.EVENT_SELECTION_CHANGED, this.togglePatternButton.bind(this));
		
		//adding of "capture as pattern"-func   
		this.facade.offer({
			name: ORYX.I18N.Patterns.selectionAsPattern, 
			functionality: this.selAsPattern.bind(this),
			group: ORYX.I18N.Patterns.toolbarButtonText, 
			description: ORYX.I18N.Patterns.toolbarButtonTooltip,
			minShape: 2,
			icon: ORYX.CONFIG.PATTERN_ADD_ICON
		});
		
		//create rootNode for patternrepository   
		this.patternRoot = new Ext.tree.TreeNode({ 
			cls: 'headerShapeRep',
			text: ORYX.I18N.Patterns.rootNodeText,
			iconCls: 'headerShapeRepImg',
			expandable: true,
			allowDrag: false,
			allowDrop: false,
			editable: false
		});
				
		//create Patternpanel as ext-tree-panel
		this.patternPanel = new Ext.tree.TreePanel({ 
			iconCls: 'headerShapeRepImg',
			cls:'shaperespository',
			root: this.patternRoot,			
			lines: false,
			rootVisible: true
		});
		
		//fixes double click behavior of treeEditor (cf. http://www.sencha.com/forum/archive/index.php/t-34170.html)
		Ext.override(Ext.tree.TreeEditor, {
			beforeNodeClick : function(){},
			onNodeDblClick : function(node, e){
				this.triggerEdit(node);
			}
		});
		
		//make nodes editable
		var treeEditor = new Ext.tree.TreeEditor(this.patternPanel, {
			constrain: true, //constrains editor to the viewport
			completeOnEnter: true,
			ignoreNoChange: true
		});		
		treeEditor.on("complete", this.onComplete.bind(this));
				
		//add pattern panel
		this.facade.addToRegion("West", this.patternPanel, null);
			
		//creating a dragzone
		var dragZone = new Ext.dd.DragZone(this.patternRoot.getUI().getEl(), {shadow: !Ext.isMac});
		
		//register drag and drop function, curry in the dragzone
		dragZone.afterDragDrop = this.afterDragDrop.bind(this, dragZone);
		dragZone.beforeDragOver = this.beforeDragOver.bind(this, dragZone);
		dragZone.beforeDragEnter = function(){
			this._lastOverElement = false;
			return true;
		}.bind(this);
		
		this.createPatternButton(); //TODO move together with event creation. see above!
		
		//create patternRepos  //TODO rename pattern repos to pattern loader!
		var ssNameSpace = $A(this.facade.getStencilSets()).flatten().flatten()[0];
		this.patternRepos = new ORYX.Plugins.Patterns.PatternRepository(ssNameSpace, 
																		this.addPatternNodes.bind(this), 
																		this.addPatternNode.bind(this), 
																		this.deletePatternNode.bind(this));
		
		//TODO register on reload event for stencil sets! don't forget that!
		this.loadAllPattern();
		
	},
	
	/**
	 * Adds a div-element to the canvas that represents the "mark as pattern" button which appears
	 * at the right side of the selection. 
	 * Also adds the necessary event listeners for the button.
	 */
	createPatternButton: function() {
		// graft the button.
		this.button = ORYX.Editor.graft("http://www.w3.org/1999/xhtml", $(null),
			['div', {'class': 'Oryx_button'}]);
		
		var imgOptions = {src: ORYX.CONFIG.PATTERN_ADD_ICON}; 
		/*if(this.option.msg){  //TODO remove???
			imgOptions.title = this.option.msg;
		}*/

		// graft and update icon (not in grafting for ns reasons).
		ORYX.Editor.graft("http://www.w3.org/1999/xhtml", this.button,
				['img', imgOptions]);
				
		this.facade.getCanvas().getHTMLContainer().appendChild(this.button);
		
		this.hidePatternButton();
		
		this.button.addEventListener(ORYX.CONFIG.EVENT_MOUSEOVER, this.buttonHover.bind(this), false);
		this.button.addEventListener(ORYX.CONFIG.EVENT_MOUSEOUT, this.buttonUnHover.bind(this), false);
		this.button.addEventListener(ORYX.CONFIG.EVENT_MOUSEDOWN, this.buttonActivate.bind(this), false);
		this.button.addEventListener(ORYX.CONFIG.EVENT_MOUSEUP, this.buttonHover.bind(this), false);
		this.button.addEventListener('click', this.buttonTrigger.bind(this), false);
	},
	
	togglePatternButton: function(options) { //TODO remove parameter??
		var selection = this.facade.getSelection();
		
		if (!this.buttonVisible) {
			//remove magic number!
			if(selection.size() >= 2) this.showPatternButton();
		} else {
			if(selection.size() >= 2) {
				this.relocatePatternButton();
			} else {
				this.hidePatternButton();
			}
		}
	},
	
	/**
	 * Displays the pattern button
	 */
	showPatternButton: function() {
		this.relocatePatternButton();
		this.button.style.display = "";
		this.buttonVisible = true;
		this.facade.getCanvas().update();
	},
	
	/**
	 * Hides the pattern button
	 */
	hidePatternButton: function() {
		this.button.style.display = "none";
		this.buttonVisible = false;
		this.facade.getCanvas().update();
	},
		
	/**
	 * Moves the pattern button to the upper right side of the current selection
	 */
	relocatePatternButton: function() {
		var selection = this.facade.getSelection();
		
		//get bounds of selection
		var bounds = null;
		selection.each(function(shape) {
			if(!bounds) {
				bounds = shape.absoluteBounds();
			} else {
				bounds.include(shape.absoluteBounds());
			}
		});
		
		//position for button
		var buttonPos = {
			x: bounds.upperLeft().x + bounds.width() + ORYX.CONFIG.SELECTED_AREA_PADDING,
			y: bounds.upperLeft().y
		};
		
		this.button.style.left = buttonPos.x + "px";
		this.button.style.top = buttonPos.y + "px";
		
	},
	
	/**
	 * Renders the pattern button solid instead of transparent
	 */
	showButtonOpaque: function() { //TODO used??
		this.button.style.opacity = 1.0;
	},
	
	/**
	 * Renders the pattern button half transparent instead of solid
	 */
	showButtonTransparent: function() {
		this.button.style.opacity = 0.5;
	},
	
	/**
	 * Changes appearance of pattern button when clicked.
	 * Add the css class Oryx_down
	 */
	buttonActivate: function() {
		this.button.addClassName('Oryx_down');
	},
	
	/**
	 * Changes appearance of pattern button when mouse is over the button.
	 * Adds the css class Oryx_hover
	 */
	buttonHover: function() {
		this.button.addClassName('Oryx_hover');
	},
	
	/**
	 * Changes the the appearance when the mouse moves out of the button.
	 * Removes the classes Oryx_down and Oryx_hover.
	 */
	buttonUnHover: function() {
		if(this.button.hasClassName('Oryx_down'))
			this.button.removeClassName('Oryx_down');

		if(this.button.hasClassName('Oryx_hover'))
			this.button.removeClassName('Oryx_hover');
	},
	
	/**
	 * Callback when clicking the button.
	 */
	buttonTrigger: function(evt) {
		this.selAsPattern();
	},
			
	/**
	 * Callback for creating a new pattern from the current selection and saving it on the server.
	 */
	selAsPattern: function() {
		var selection = this.facade.getSelection();
		
		//json everything
		var jsonSel = selection.collect(function(element) {
			return element.toJSON();
		});
		
		//clean it up
		jsonSel = this.removeDanglingEdges(jsonSel);
		jsonSel = this.removeObsoleteReferences(jsonSel);
		
		/*//delete all patterns  //TODO delete!
		selection.each(function(element) {
			this.facade.deleteShape(element);
		}.bind(this));
		*/
		
		this.addNewPattern(jsonSel);	
		
	},
	
	/**
	 * Load all pattern from the server and display them in the pattern panel.
	 */
	loadAllPattern: function() {
		this.patternRepos.loadPattern(); //TODO idempotency! i.e. remove the pattern from the panel!
		
	},
	
	/**
	* Adds a new pattern to the server and adds pattern node in pattern panel.
	* @param {Array} serPattern raw (directly from canvas) serialized Shapes in JSON format
	*/
	addNewPattern: function(serPattern) {
		
		var opt = {
			serPattern: serPattern,
			name: ORYX.I18N.Patterns.newPattern,
			imageUrl: undefined,
			id: undefined
		};
		
		var pattern = new ORYX.Plugins.Patterns.Pattern(opt);
		
		this.patternRepos.addPattern(pattern); //TODO take the new pattern with filled id, etc...
	},
	
	/**
	 * Adds the pattern from the supplied array as tree nodes in the pattern panel
	 * @param {Array} patternArray consists of ORYX.Plugins.Patterns.Pattern instances
	 */
	addPatternNodes: function(patternArray) {
		patternArray.each(function(pattern){  //TODO beautify with apply or map or something like that!
			this.addPatternNode(pattern);
		}.bind(this));
	},
	
	/**
	* Add the nodes for the supplied pattern to pattern panel
	* @param {ORYX.Plugins.Patterns.Pattern} pattern to be added pattern
	*/
	addPatternNode: function(pattern) {		
		//add the pattern subnode    //TODO delete?
		// var newNode = new Ext.tree.TreeNode({
		// 			leaf: true,
		// 			text: pattern.description,  
		// 			iconCls: 'headerShapeRepImg',
		// 			cls: 'ShapeRepEntree PatternRepEntry',
		// 			icon:  ORYX.CONFIG.PATTERN_ADD_ICON,
		// 			allowDrag: false,
		// 			allowDrop: false,
		// 			attributes: pattern,
		// 			uiProvider: ORYX.Plugins.Patterns.PatternNodeUI
		// 		});
		var newNode = new ORYX.Plugins.Patterns.PatternNode(pattern);
		
		pattern.treeNode = newNode;
				 	
		this.patternRoot.appendChild(newNode);
		newNode.render();	 //TODO really necessary?????
		
		var ui = newNode.getUI();
		
		/*//Set the tooltip
		//Warum NS nutzen, wenn dann kein NS übergeben wird?!?!
		ui.elNode.setAttributeNS(null, "title", "Testdescription");*/
		
		//register the pattern on drag and drop
		Ext.dd.Registry.register(ui.elNode, {
			node: ui.node,
			handles: [ui.elNode, ui.textNode].concat($A(ui.elNode.childNodes)), //TODO has one undefined element! fix that!
			isHandle: false,
			type: "and-split" //TODO this does not make sense!
		});
		
		this.patternRoot.expand();	
		
		//TODO delete?
		/*var deleteButton = document.createElement("span");
		deleteButton.className = "PatternDeleteButton";
		
		var deleteButtonB = document.createElement("button");
		deleteButtonB.down = function(){alert("Hello!")};
		deleteButtonB.setAttribute("style", "background-image: url(\"" + ORYX.PATH + "/images/delete.png\");");
		deleteButtonB.setAttribute("type", "button");
		
		deleteButton.appendChild(deleteButtonB);
		
		newNode.getUI().elNode.appendChild(deleteButton);*/
	},
	
	/**
	 * Removes the node of a pattern from the pattern panel
	 * @param {ORYX.Plugins.Patterns.Pattern} the server-side deleted pattern whose tree node representation
	 * shall be deleted.
	 */
	deletePatternNode: function(pattern) {
		pattern.treeNode.remove();
	},
	
	/**
	 * Handles the event when the user finishes input for the name of a pattern in a pattern tree node.
	 * @param {Ext.tree.TreeEditor} editor
	 * @param {Mixed} value new value after editing the node
	 * @param {Mixed} startValue value before editing the node  
	 */
	onComplete: function(editor, value, startValue) {  //TODO why being called two times???
		var pattern = editor.editNode.attributes.attributes;
		
		return pattern.setName(value);
	},
	
	/**
	 * Inserts the dropped pattern from the pattern node in the canvas
	 * @param {Ext.dd.DragZone} dragZone
	 * @param {Ext.dd.DragDrop} target The drop target
	 * @param {Event e} event The event object
	 * @param {String} id The id of the dropped element
	 */
	afterDragDrop: function(dragZone, target, event, id) {
		
		this._lastOverElement = undefined;
		
		//Hide the highlighting
		//do i really need this???????
		this.facade.raiseEvent({type: ORYX.CONFIG.EVENT_HIGHLIGHT_HIDE, highlightId:'patternRepo.added'});
		this.facade.raiseEvent({type: ORYX.CONFIG.EVENT_HIGHLIGHT_HIDE, highlightId:'patternRepo.attached'});
		
		//Check if drop is allowed
		var proxy = dragZone.getProxy();
		if(proxy.dropStatus == proxy.dropNotAllowed) {return;}
		
		//check if there is a current Parent
		//what do these lines do?
		//if(!this._currentParent) {return;}
				
		//TODO use .pattern instead!
		var templatePatternShapesSer = Ext.dd.Registry.getHandle(target.DDM.currentTarget).node.attributes.attributes.serPattern;
		var templatePatternShapes = Ext.decode(templatePatternShapesSer);
		
		//renew resourceIds
		var patternShapes = this.renewResourceIds(templatePatternShapes);
		
		//copies positionmanagement from shape repository
		var xy = event.getXY();
		var pos = {x: xy[0], y: xy[1]};
		
		var a = this.facade.getCanvas().node.getScreenCTM();

		// Correcting the UpperLeft-Offset
		pos.x -= a.e; pos.y -= a.f;
		// Correcting the Zoom-Faktor
		pos.x /= a.a; pos.y /= a.d;
		// Correcting the ScrollOffset
		pos.x -= document.documentElement.scrollLeft;
		pos.y -= document.documentElement.scrollTop;
		// Correct position of parent  
		// brauch ich das???
		/*var parentAbs = this._currentParent.absoluteXY();
		pos.x -= parentAbs.x;
		pos.y -= parentAbs.y;*/
		
		
		var centralPoint = this.findCentralPoint(patternShapes);
		
		var transformVector = {
			x: pos.x - centralPoint.x,
			y: pos.y - centralPoint.y
		};
		patternShapes = this.transformPattern(patternShapes, transformVector);
		
		//correct position of pattern if it leaves canvas to the left or right side of the canvas
		transformVector = this.calculateCorrectionVector(this.facade.getCanvas().bounds, patternShapes);
		patternShapes = this.transformPattern(patternShapes, transformVector);
		
		var commandClass = ORYX.Core.Command.extend({
			construct : function(patternShapes, facade, centralPoint, pos, plugin){
				this.patternShapes = patternShapes;
				this.facade = facade;
				this.centralPoint = centralPoint;
				this.pos = pos;
				this.shapes;
				this.plugin = plugin;
			},
			
			execute : function() {
				
				//add the shapes
				this.shapes = this.facade.getCanvas().addShapeObjects(this.patternShapes, this.facade.raiseEvent);

				/*//calc difference in positions
				var transVector = {
					x : this.pos.x - this.centralPoint.x,
					y : this.pos.y - this.centralPoint.y
				};

				//recursively change the position		
				var posChange = function(transVector, shapes) {
					shapes.each(function(transVector, shape) {
						shape.bounds.moveBy(transVector);
						posChange(transVector, shape.getChildren());
					}.bind(this, transVector));
				};

				posChange(transVector, this.shapes);*/
				
				this.plugin.doLayout(this.shapes);
				
				this.facade.setSelection(this.shapes);
				this.facade.getCanvas().update();
				this.facade.updateSelection();
			},
			
			rollback: function() {
				var selection = this.facade.getSelection();
				
				//delete all shapes
				this.shapes.each(function(shape, index){
					this.facade.deleteShape(shape);
					selection = selection.without(shape);
				}.bind(this));
				
				this.facade.setSelection(selection);				
				this.facade.getCanvas().update();				
			}
		});
		
	//	var position = this.facade.eventCoordinates(event.browserEvent);
		
		var command = new commandClass(patternShapes, this.facade, centralPoint, pos, this);
		
		this.facade.executeCommands([command]);
	},
	
	/**
	 * Moves the pattern relatively to an old position to the new position
	 * @param {Array} patternShapes An Array of serialized oryx shapes
	 * @param {Object} transformVector Object whose x and y coordinate describe the vector by which
	 * all shapes in the pattern have to be moved.
	 */
	transformPattern: function(patternShapes, transformVector) {	
		
		//recursively change the position		
		var posChange = function(transVector, shapes) {
			shapes.each(function(transVector, shape) {
				shape.bounds.lowerRight.x += transVector.x;
				shape.bounds.lowerRight.y += transVector.y;
				shape.bounds.upperLeft.x += transVector.x;
				shape.bounds.upperLeft.y += transVector.y;
				
				//except last and first docker all have relative positions.
				var counter = 0;
				var max = shape.dockers.size();
				
				for(var i=1; i<shape.dockers.size()-1; i++) {
					shape.dockers[i].x += transVector.x;
					shape.dockers[i].y += transVector.y;
				}
				
/*				shape.dockers.each(function(transVector, counter, max, docker) {
					counter++;
					if (counter == 1 || counter == max) return;
					docker.x += transVector.x;
					docker.y += transVector.y;
				}.bind(this, transVector, counter, max));
*/				
				posChange(transVector, shape.childShapes);
			}.bind(this, transVector));
		};
		
		posChange(transformVector, patternShapes);
		
		return patternShapes;
	},
	
	/**
	* Calculates the vector by which the pattern has to be moved in order not to leave
	* the supplied bounds in the upper left corner.
	* @param {ORYX.Core.Bounds} outerBounds Bounds that shapes have to fit in
	* @param {Array} shapeArray The Shapes that have to fit into the bounds
	* @returns The correction vector
	*/
	calculateCorrectionVector: function(outerBounds, shapeArray) {
		var correctionVector = {
			x: 0,
			y: 0
		};
		
		shapeArray.each(function(shape) {
			if (shape.bounds.upperLeft.x < outerBounds.upperLeft().x) {
				correctionVector.x = Math.max(correctionVector.x, outerBounds.upperLeft().x - shape.bounds.upperLeft.x);
			}
			if (shape.bounds.upperLeft.y < outerBounds.upperLeft().y) {
				correctionVector.y = Math.max(correctionVector.y, outerBounds.upperLeft().y - shape.bounds.upperLeft.y);
			}
		});
		
		return correctionVector;
	},
	
	/**
	 * Determines the central point in an array of serialized shapes.
	 * @param {Array} shapeArray Contains serialized shapes (not JSON Strings, but JSON representations). 
	 */
	findCentralPoint: function(shapeArray) {
		
		if(shapeArray.size() === 0) return;
		
		var initBounds = new ORYX.Core.Bounds(shapeArray[0].bounds.upperLeft, shapeArray[0].bounds.lowerRight);
		
		var shapeBounds = shapeArray.inject(initBounds, function(bounds, shape) {
			var add = new ORYX.Core.Bounds(shape.bounds.upperLeft, shape.bounds.lowerRight);
			bounds.include(add);
			return bounds;
		});
		
		return shapeBounds.center();
		
		/*//hier sollte vllt. noch der mittelpunkt vom shape berechnet werden?
		var sumX = shapeArray.inject(0, function(acc, shape) {
			return acc + shape.bounds.upperLeft.x;
		});
		
		var sumY = shapeArray.inject(0, function(acc, shape) {
			return acc + shape.bounds.upperLeft.y;
		});
		
		var meanX = sumX / shapeArray.size();
		var meanY = sumY / shapeArray.size();
		
		return {
			x: meanX,
			y: meanY
		};*/
		
	},
	
	beforeDragOver: function(dragZone, target, event) {  //TODO remove???
		/*
		var coord = this.facade.eventCoordinates(event.browserEvent);
		var aShapes = this.facade.getCanvas().getAbstractShapesAtPosition( coord );
		
		if(aShapes.length <= 0) {
			var pr = dragZone.getProxy();
			pr.setStatus(pr.dropNotAllowed);
			pr.sync();
			
			return false;
		}
		
		//get the topmost shape
		var el = aShapes.last();
		
		//muss das hier length oder lenght heißen?
		if(aShapes.length == 1 && aShapes[0] instanceof ORYX.Core.Canvas) {
			return false;
		} else {
			//check containment rules for each shape of pattern
			var option = Ext.dd.Registry.getHandle(target.DDM.currentTarget);
			var pattern = this.retrievePattern(option.id);			
			var stencilSet = this.facade.getStencilSets()[option.namespace];
			
			pattern.shapes.each(function(shape, index, stencilSet, coord){
				var stencil = stencilSet.stencil(shape.type);
				
				if(stencil.type() === "node") {
					
					var parentCandidate = aShapes.reverse().find(function(candidate){
						return (candidate instanceof ORYX.Core.Canvas
							|| candidate instanceof ORYX.Core.Node
							|| candidate instanceof ORYX.Core.Edge);
					}); //gibt der nicht einfach any aus? das sind doch alle drei typen oder?
					
					if (parentCandidate !== this._lastOverElement){
						
						this._canAttach = undefined;
						this._canContain = undefined;
						
					}
					
					if (parentCandidate) {
						
						//check containment rule
						
						if(!(parentCandidate instanceof ORYX.Core.Canvas) && parentCandidate.isPointOverOffset(coord.x, coord.y) && this._canAttach == undefined) {
							
							this._canAttach = this.facade.getRules().canConnect({
								sourceShape: parentCandidate,
								edgeStencil: stencil,
								targetStencil: stencil
							});
							
							if( this._canAttach ) {
								//Show Highlight
								this.facade.raiseEvent({
									type: ORYX.CONFIG.EVENT_HIGHLIGHT_SHOW,
									highlightId: "patternRepo.attached",
									elements: [parentCandidate],
									style: ORYX.CONFIG.SELECTION_HIGHLIGHT_STYLE_RECTANGLE,
									color: ORYX.CONFIG.SELECTION_VALID_COLOR
								});
								
								this.facade.raiseEvent({
									type: ORYX.CONFIG.EVENT_HIGHLIGHT_HIDE,
									highlightId: "patternRepo.added"
								});
								
								this._canContain = undefined;
							}
						}
						
						if(!(parentCandidate instanceof ORYX.Core.Canvas) && !(parentCandidate.isPointOverOffset(coord.x, coord.y))) {
							this._canAttach = this._canAttach == false ? this._canAttach : undefined;
						}
						
						if (!this._canContain == undefined && !this._canAttach) {
							this._canContain = this.facade.getRules;
						}
					}
				}
				
			}.bind(this, stencilSet, coord)); //curry in stencilset, coord
		}*/
	},
	//copied from main
	
	//OBSOLETE COMMENT
	
	
	/**
     * This method renews all resource Ids and according references.
     * @param {Object} jsonObject
     * @throws {SyntaxError} If the serialized json object contains syntax errors.
     * @return {Object} The jsonObject with renewed ids.
     * @private
     */
    renewResourceIds: function(jsonObjectArray){
        // For renewing resource ids, a serialized and object version is needed
        /*
		if(Ext.type(jsonObjectCollection) === "string"){
            try {
                var serJsonObject = jsonObject;
                jsonObject = Ext.decode(jsonObject);
            } catch(error){
                throw new SyntaxError(error.message);
            }
        } else {
            var serJsonObject = Ext.encode(jsonObject);
        } */  //TODO remove

       var serJsonObjectArray = Ext.encode(jsonObjectArray);

		// collect all resourceIds recursively
        var collectResourceIds = function(shapes){
            if(!shapes) return [];

            return shapes.collect(function(shape){
                return collectResourceIds(shape.childShapes).concat(shape.resourceId);
            }).flatten();
        };
        var resourceIds = collectResourceIds(jsonObjectArray);

        // Replace each resource id by a new one
        resourceIds.each(function(oldResourceId){
            var newResourceId = ORYX.Editor.provideId();
            serJsonObjectArray = serJsonObjectArray.gsub('"'+oldResourceId+'"', '"'+newResourceId+'"');
        });

        return Ext.decode(serJsonObjectArray);
    },

	/**
	* Removes all edges that reference non-existing (in the pattern) shapes.
	* @param {Array} jsonObjectArray JSONObjects of shapes
	*/
	removeDanglingEdges: function(jsonObjectArray) {
		//recursion deep check???
		var result = jsonObjectArray.select(function(jsonObjectArray, serShape) {
			if(!serShape.target) { //is node?
				return true;
			} else { //is edge
				return this.isTargetOfShapeInCollection(serShape, jsonObjectArray);			}
		}.bind(this, jsonObjectArray));
		
		return result;
	},
	
	/**
	 * Tests if the target of a shapes is itself part of the supplied shape collection.
	 * @param {Object} serShape JSONObject whose target should be tested
	 * @param {Array} collection The collection of shapes that should be considered
	 * @return {Boolean} True if the target of serShape is contained in the collection.
	 */
	isTargetOfShapeInCollection: function(serShape, collection) {  //TODO remove of in the name!
		return collection.any(function(serShape, possibleTarget) {
			return serShape.target.resourceId == possibleTarget.resourceId;
		}.bind(this, serShape));
	},
	
	/**
	 * Removes all references of outgoing edges whose edges are not contained in the shape collection
	 * from the collection of shapes.
	 * @param {Array} jsonObjectArray all shapes whose outgoing edges should be checked for inclusion.
	 * @returns Array of shapes with no dangling references to missing outgoing edges.  
	 */
	removeObsoleteReferences: function(jsonObjectArray) {
		var result = jsonObjectArray;
		
		result.each(function(serShape) {
			var newOutgoingEdges = serShape.outgoing.select(function(out) {
				return result.any(function(out, possibleMatch) {
					return possibleMatch.resourceId == out.resourceId;
				}.bind(this, out));
			});
			
			serShape.outgoing = newOutgoingEdges;
		});
		
		return result;
	}

});

/**
 * Represents a pattern.
 * @class ORYX.Plugins.Patterns.Pattern
 * @extends Clazz
 * @param {Object} opt Can contain the serPattern, id, imageUrl, name to be set in the new instance.
 */
ORYX.Plugins.Patterns.Pattern = Clazz.extend(
	/** @lends ORYX.Plugins.Patterns.Pattern.prototype */
	{
	/**
	 * Array of serialized pattern shapes, i.e. JSON objects.
	 */
	serPattern : undefined,
	
	/**
	 * The ID of the pattern as set by the server
	 */
	id : undefined,
	
	/**
	 * The URL of the thumbnail image of the pattern
	 */
	imageUrl : undefined,
	
	/**
	 * The name of the pattern
	 */
	name : undefined,
	
	/**
	 * The repository that saves the pattern
	 */
	repos: undefined,
	
	/**
	 * The tree node that represents the pattern.
	 */
	treeNode: undefined, //saved the "viewer" tree node
	
	/**
	 * @constructor
	 */
	construct: function(opt) {
		if(opt.serPattern !== null) this.serPattern = opt.serPattern; //refactor!!!
		if(opt.id !== null) this.id = opt.id;
		if(opt.imageUrl !== null) this.imageUrl = opt.imageUrl;
		if(opt.name !== null) this.name = opt.name;
	},
	
	/**
	 * Sets the name of the pattern and updates the server representation of this pattern.
	 */
	setName: function(name) {
		if (this.repos == null) return;
		
		this.name = name;
		this.repos.savePattern(this);
	},
	
	/**
	 * Removes the pattern from the server.
	 */
	remove: function() {
		this.repos.removePattern(this); //toggles through callback removal of treenode!
	},
	
	/**
	 * Creates a JSON representation of the pattern containing only the id, name, serPattern, imageUrl.
	 */
	toJSONString: function() {
		return Ext.encode({
			id: this.id,
			name: this.name,
			serPattern: this.serPattern,
			imageUrl: this.imageUrl
		});
	}
	
});

/**
 * Represents a loader for patterns for a specific stencilset.
 * @class ORYX.Plugins.Patterns.PatternRepository
 * @extends Clazz
 * @param {String} ssNameSpace The namespace of the stencil for which this loader is intended.
 * @param {function(Array patterns)} onPatternLoad Callback when a pattern are loaded from the server via loadPattern().
 * @param {function(pattern)} onPatternAdd Callback when a pattern is added to the repository. Provides the pattern as received from server.
 * @param {function()} onPatternRemove Callback when a pattern is deleted.
 */
ORYX.Plugins.Patterns.PatternRepository = Clazz.extend(
	/** @lends ORYX.Plugins.Patterns.PatternRepository.prototype */
	{
	patternList : [], //TODO delete and remove from code or document!
	
	/**
	 * The name space of the stencil set for which pattern can be maintained. 
	 */
	ssNameSpace : undefined, 
	
	/**
	 * Callback when pattern are loaded.
	 */
	onPatternLoad: function(patternArray){}, 
	
	/**
	 * Callback when a single pattern is added.
	 */
	onPatternAdd: function(pattern){},
	
	/**
	 * Callback when a single pattern is deleted.
	 */
	onPatternRemove: function(){},
	
	/**
	 * @constructor
	 */
	construct: function(ssNameSpace, onPatternLoad, onPatternAdd, onPatternRemove) { //TODO refactor introduce object parameter for constructor
		this.ssNameSpace = ssNameSpace;
		this.onPatternLoad = onPatternLoad;
		this.onPatternAdd = onPatternAdd;
		this.onPatternRemove = onPatternRemove;
	},
	
	/**
	 * Loads all pattern for set stencil set from server. Fires callback onPatternLoad. 
	 */
	loadPattern: function() {
		this._sendRequest("GET", {ssNameSpace: this.ssNameSpace}, function(resp) {
			var patterns = Ext.decode(resp);
			patterns.each(function(opt) {
				var pattern = new ORYX.Plugins.Patterns.Pattern(opt);
				pattern.repos = this;
				this.patternList.push(pattern);
			}.bind(this));
			this.onPatternLoad(this.patternList);
		}.bind(this));
	},
	
	/**
	 * Gets all loaded pattern.
	 * @returns An array of patterns of the type ORYX.Plugins.Patterns.Pattern
	 */
	getPatterns: function() {
		return this.patternList;
	},
	
	/**
	 * Adds the supplied pattern to the server.
	 * @param {ORYX.Plugins.Patterns.Pattern} pattern The pattern to be added to the server. 
	 */
	addPattern: function(pattern) {
		var params = {
			pattern: pattern.toJSONString(),
			ssNameSpace: this.ssNameSpace
		};
		
		this._sendRequest("PUT", params, function(resp){
			var opt = Ext.decode(resp);
			var pattern = new ORYX.Plugins.Patterns.Pattern(opt);  //TODO implement constructor with repos!!!
			pattern.repos = this;
			this.onPatternAdd(pattern);
		}.bind(this)); //TODO reflect failed add with removing the node??
	},
	
	/**
	 * Updates a pattern that is already saved on the server with the supplied values. 
	 * Not supplied values are overriden.
	 * @param {ORYX.Plugins.Patterns.Pattern} pattern The pattern to be saved.
	 */
	savePattern: function(pattern) {
		this._sendRequest("POST", {pattern: pattern.toJSONString(), ssNameSpace: this.ssNameSpace}); //TODO use callbacks?
	},
	
	/**
	 * Removes / Delete a pattern from the server.
	 * @param {ORYX.Plugins.Patterns.Pattern} pattern The pattern to be deleted from the server.
	 */
	removePattern: function(pattern) {
		var params = {
			pattern: pattern.toJSONString(), //TODO handle uniformly!
			ssNameSpace: this.ssNameSpace
		};
		this._sendRequest("DELETE", params, function(resp) {  //onSuccess
			this.onPatternRemove(pattern);
		}.bind(this));
	},
	
	/**
	 * Sends an AJAX request to the server directed to rootpath + "/pattern"
	 * @private
	 * @param {String} method The used method to communicate with the server. GET and POST will be 
	 * translated properly to HTTP METHODS. PUT and DELETED are sent as POSTS with the _method parameter
	 * set accordingly.
	 * @param {Object} params The parameters to be set in the request.
	 * @param {function(responseText)} successcallback Will be called on success of the server request.
	 * @param {function()} failedcallback Will be called if transport failed. 
	 */
	_sendRequest: function( method, params, successcallback, failedcallback ){

		var suc = false;

		new Ajax.Request(
		ORYX.CONFIG.ROOT_PATH + "/pattern", //url is fixed  //TODO provide configuration????
		{
           method			: method,
           asynchronous		: true, 
           parameters		: params,
		   onSuccess		: function(transport) 
		   {
				suc = true;
		
				if(successcallback)
				{
					successcallback( transport.responseText );	
				}
		
		   }.bind(this),
		   onFailure		: function(transport) 
		   {
				if(failedcallback)
				{							
					failedcallback();							
				} 
				else 
				{
					this._showErrorMessageBox(ORYX.I18N.Patterns.patternRepository, ORYX.I18N.Patterns.comFailed);
					ORYX.Log.warn("Communication failed: " + transport.responseText);	//TODO warning ORYX.log is undefined check if Log instead of log did the trick
				}					
		   }.bind(this)		
		});
		
		return suc;		
	},
	
	/**
	 * Displays a simple error message box in the middle of the screen.
	 * @private
	 * @params {String} title The title of the error message dialog.
	 * @params {String} msg The message that should be displayed in the dialog.
	 */
	_showErrorMessageBox: function(title, msg)
	{
        Ext.MessageBox.show({
           title: title,
           msg: msg,
           buttons: Ext.MessageBox.OK,
           icon: Ext.MessageBox.ERROR
       });
	}
});

/**
 * Represents a tree node. Simplifies initialization of a tree node.
 * @class ORYX.Plugins.Patterns.PatterNode
 * @extends Ext.tree.TreeNode
 * @params {ORYX.Plugins.Patterns.Pattern} pattern The pattern that should be displayed by the tree node.
 */
ORYX.Plugins.Patterns.PatternNode = Ext.extend(Ext.tree.TreeNode, 
	/** @lends ORYX.Plugins.Patterns.PatternNode.prototype */
	{
	
	/**
	 * The pattern that is represented by this pattern tree node. {ORYX.Plugins.Patterns.Pattern}
	 */
	pattern: undefined, 
	
	/**
	 * @constructor
	 */
	constructor: function(pattern) {
		//normally ext uses initComponent for the following, but
		//no initComponent protocoll in TreeNode, thus using constructor!
		this.pattern = pattern;
		
		//call superclass constructor		
		ORYX.Plugins.Patterns.PatternNode.superclass.constructor.call(this, {
			allowChildren: false,
			leaf: true,
			iconCls: 'headerShapeRepImg',
			cls: 'ShapeRepEntree PatternRepEntry',
			icon:  ORYX.CONFIG.PATTERN_ADD_ICON,
			allowDrag: false,
			allowDrop: false,
			uiProvider: ORYX.Plugins.Patterns.PatternNodeUI,
			text: this.pattern.name,
			attributes: this.pattern  //TODO still ncessary?
		});
	},
	
	/**
	 * Prevents that the delete button is shown in the Ghost Proxy of Drag and Drop of Ext.
	 */
	beforeMove: function(tree, node, newParent, oldParent, index) {
		node.getUI().deleteButton.hide();
	}
});

/**
 * Provides customized appearance of a tree node for the pattern node.
 * @class ORYX.Plugins.Patterns.PatternNodeUI
 * @extends Ext.tree.TreeNodeUI
 */
ORYX.Plugins.Patterns.PatternNodeUI = Ext.extend(Ext.tree.TreeNodeUI, 
	/** @lends ORYX.Plugins.Patterns.PatternNodeUI.prototype */
	{
		/**
		 * Renders the node and add the delete button.
		 * @param render  (cf. Ext framework)
		 */
		render: function(bulkRender) { 
			//	this.superclass.render.apply(this, arguments);
			//onRender not properly implemented in used Ext Version!
			if (this.rendered) return;
			
			ORYX.Plugins.Patterns.PatternNodeUI.superclass.render.apply(this, arguments);
						
			var span = document.createElement("span");
			span.className = "PatternDeleteButton";
			this.elNode.appendChild(span);
			
			var deleteFunction = function() {
				var pattern = this.node.attributes.attributes; //TODO use .pattern here!
				pattern.remove();
			}
			
			this.deleteButton = new Ext.Button({
									icon: ORYX.PATH + "images/delete.png", //TODO externalize!
									handler: deleteFunction.bind(this),
									cls: "x-btn-icon",
									renderTo: span
								});
								
			//this.deleteButton.getEl().fadeOut();
			this.deleteButton.hide();
			
		},
		
		/**
		 * Displays the delete button when mouse is over the tree node
		 */
		onOver: function() {
			ORYX.Plugins.Patterns.PatternNodeUI.superclass.onOver.apply(this, arguments);
			
			// //already visible? prohibits calling fade in for visible element.
			// 			if (this.deleteButton.getEl().dom.style.visibility == "visible") return;
			// 					
			// 			this.deleteButton.getEl().fadeIn({block: true});
			this.deleteButton.show();
		},
		
		/**
		 * Hides the delete button when mouse is leaving the tree node.
		 */
		onOut: function() { //TODO maybe set a timer to prohibit continously fading in and out!
 			ORYX.Plugins.Patterns.PatternNodeUI.superclass.onOut.apply(this, arguments);
			
			// //already faded out --> not visible
			// 			if (this.deleteButton.getEl().dom.style.visibility != "visible") return;
			// 			
			// 			this.deleteButton.getEl().fadeOut({block: true});
			this.deleteButton.hide();
		}
			
});