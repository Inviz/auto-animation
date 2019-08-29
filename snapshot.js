Snapshot = function(element, lazy) {
	this.element = element;
	this.measurements = new Map();
	this.groups = {};
	if (!lazy) {
		this.measure(element);
	}
}

Snapshot.prototype.snapshot = function(element, parentSnapshot) {
	const styles = window.getComputedStyle(element);
	const box = element.getBoundingClientRect()
	return {
		left: box.left,
		top: box.top,
		offsetLeft: element.offsetParent ? element.offsetLeft : box.left,
		offsetTop: element.offsetParent ? element.offsetTop : box.top,
		width: box.width,
		height: box.height,
		position: styles.position,
		lineHeight: styles.lineHeight,
		fontSize: parseFloat(styles.fontSize),
		opacity: parseFloat(styles.opacity),
		display: styles.display,
		translateX: 0,
		translateY: 0,
		hidden: parentSnapshot.hidden || styles.visibility === 'hidden' || (element.offsetWidth === 0 && element.offsetHeight === 0),
		cssText: element.style.cssText,
		cascadeGroup: element.getAttribute('data-cascade-group'),
		cascadeIndex: element.getAttribute('data-cascade-index') ? parseInt(element.getAttribute('data-cascade-index')) : undefined,
		cascadeDelay: element.getAttribute('data-cascade-delay') ? parseInt(element.getAttribute('data-cascade-delay')) : 200
	}
}

Snapshot.prototype.chainCascade = function(from, to, styles, group, action, time) {
	var list = this.groups[group];
	if (!list) {
		list = this.groups[group] = [];
	}
	for (var i = 0; i < list.length; i++) {
		if (list[i].key === from.key) {
			if (action === list[i].action) {
				return;
			}
			list.splice(i, 1);
			break;
		}
	}
	const fromStyles = {};
	const toStyles = {};
	for (var property in to) {
		if (from[property] !== to[property]) {
			fromStyles[property] = from[property];
			toStyles[property] = to[property];
		}
	}
	list.push({
		action: action,
		key: from.key, 
		to: toStyles,
		from: fromStyles,
		interval: 200,
		start: list.length ? list[list.length - 1].start + 200 : time
	})
} 

Snapshot.prototype.normalize = function (element, snapshot, parentSnapshot, time) {
	let from = snapshot.get(element);
	let to = this.get(element);
	this.groups = snapshot.groups 

	if (element.id === 'el1')
		debugger

	if (!to && !from) return;


	let appearance;
	let disappearance

	if (from && !from.hidden && (!to || to.hidden)) {
		disappearance = this.getDisappearanceStyles(to, from);
		to = {
			...from,
			cssText: to.cssText,
			...disappearance
		}
		this.set(element, to)
	}

	if ((!from || from.hidden) && !to.hidden) {
		appearance = this.getAppearanceStyles(to, from);
		from = {
			...to,
			hidden: true,
			...appearance
		}
		if (to.cascadeGroup) {
			this.chainCascade(from, to, appearance, to.cascadeGroup, 'appearance', time);
		}
		snapshot.set(element, from)
	}

	if (to.display === 'inline') {
		return to;
	}
	
	// inherit ongoing transitions
	to.transitions = from.transitions || {};
	to.chain = from.chain || {};
	to.overrides = from.overrides;
	to.restored = from.restored;
	to.parentSnapshot = parentSnapshot;
	to.diffLeft = !from ? 0 : to.left - from.left;
	to.diffTop = !from ? 0 : to.top - from.top;

	// check if size or position have changed
	const diffDistance = !from ? 0 : 
		Math.abs((parentSnapshot && parentSnapshot.diffLeft ? - parentSnapshot.diffLeft : 0) + to.left - from.left) + 
		Math.abs((parentSnapshot && parentSnapshot.diffTop ? - parentSnapshot.diffTop : 0) + to.top - from.top);
	const diffSize = !from ? 0 : Math.abs(to.width - from.width) + Math.abs(to.height - from.height);;

	to.repositionedChildrenCount = 0;
	if (element.children) {
		for (var i = 0; i < element.children.length; i++) {
			const childMeasurement = this.normalize(element.children[i], snapshot, to, time);
			if (childMeasurement.repositioned) {
				to.repositionedChildrenCount++;
			}
		}
	}

	/*
	// freeze flex children
	if (to.repositionedChildrenCount && to.display === 'flex') {

		if (element.children) {
			for (var i = 0; i < element.children.length; i++) {
				const childMeasurement = this.get(element);
				childMeasurement.repositioned = true;
			}
		}
	}*/

	to.repositioned = from.repositioned || appearance || disappearance || diffSize > 3 || diffDistance > 3// || from.fontSize !== to.fontSize || from.lineHeight !== to.lineHeight;
	
	return to;
}

Snapshot.prototype.reset = function(element) {
	this.forEach((measurement) => {
		measurement.element.style.cssText = measurement.cssText;
		measurement.element.classList.remove('morphing')
		if (measurement.restored) {
			measurement.element.parentNode.removeChild(measurement.element);
		}
	});
}

Snapshot.prototype.measure = function(element, parent) {
	if (parent === undefined) {
		var parent = {left: 0, top: 0}
	}
	var measurements = this.snapshot(element, parent);
	measurements.transitions = {};
	measurements.element = element;
	measurements.key = this.getKey(element);
	this.set(element, measurements);
	for (var i = 0; i < element.children.length; i++)
		this.measure(element.children[i], measurements);
}

Snapshot.prototype.getKey = function(element) {
	return element;
}

Snapshot.prototype.set = function(element, values) {
	return this.measurements.set(this.getKey(element), values)
}

Snapshot.prototype.get = function(element) {
	return this.measurements.get(this.getKey(element))
}

Snapshot.prototype.forEach = function(callback) {
	return this.measurements.forEach(callback);
}

Snapshot.prototype.morph = function(snapshot, time) {
	snapshot.transitionCount = 0;
	var cascadeCount = 0;
	for (var cascadeGroup in snapshot.groups) {
		var cascadeList = snapshot.groups[cascadeGroup];
		for (var i = 0; i < cascadeList.length; i++) {
			if (cascadeList[i].start <= time) {
				const to = snapshot.get(cascadeList[i].key);
				to.repositioned = true;
				to.overrides = cascadeList[i].to;
			} else {
				const to = snapshot.get(cascadeList[i].key)
				to.overrides = cascadeList[i].from;
				cascadeCount++;
			}
			if (cascadeList[i].start + cascadeList[i].interval <= time) {
				cascadeList.splice(i--, 1);
			}
		}
	}
	snapshot.forEach((to, key) => {
		const from = this.measurements.get(key);
		if (to.repositioned) {
			if (to.overrides) {
				Object.assign(to, to.overrides)
			}
			const currentLeft    = snapshot.transition(to.element, 'left', time, from, to)
			const currentX       = snapshot.transition(to.element, 'translateX', time, from, to)
			const currentTop     = snapshot.transition(to.element, 'top', time, from, to)
			const currentY       = snapshot.transition(to.element, 'translateY', time, from, to)
			const currentWidth   = snapshot.transition(to.element, 'width', time, from, to)
			const currentHeight  = snapshot.transition(to.element, 'height', time, from, to)
			const parent         = to.parentSnapshot;
			const staticParent   = !parent.repositioned && parent.repositionedChildrenCount && parent.position === 'static';
			
			const parentLeft = to.left - parent.left + (staticParent ? parent.offsetLeft : 0);
			const offsetLeft = currentLeft - to.left;
			const parentOffsetLeft = (parent.transitions && parent.transitions.left ?  parent.transitions.left.value - parent.left : 0);
			const currentParentLeft = currentX + parentLeft + offsetLeft - parentOffsetLeft;
			
			const parentTop = to.top - parent.top + (staticParent ? parent.offsetTop : 0);
			const offsetTop = currentTop - to.top;
			const parentOffsetTop = (parent.transitions && parent.transitions.top ?  parent.transitions.top.value - parent.top : 0);
			const currentParentTop = currentY + parentTop + offsetTop - parentOffsetTop;
			to.element.style.position = 'absolute';
      to.element.style.margin = 0;
      to.element.style.transform = 'translateX(' + currentParentLeft + 'px) translateY(' + currentParentTop + 'px)'
      to.element.style.top = 0
      to.element.style.left = 0
      to.element.style.width = currentWidth + 'px'
      to.element.style.height = currentHeight + 'px'
      to.element.style.display = to.display;
      if (to.styles)
      	Object.assign(to.element.style, to.styles);
      to.element.classList.add('morphing')
		}

		const currentOpacity = to.transitions.opacity || (from ? from.opacity : to.opacity);
		if (from && to.opacity !== currentOpacity) {
			const currentOpacity = snapshot.transition(to.element, 'opacity', time, from, to)
      to.element.style.opacity = currentOpacity
		} else {
			to.element.style.opacity = to.opacity;
		}
	});
	return snapshot.transitionCount > 0 || cascadeCount > 0
}

Snapshot.prototype.transition = function(element, property, time, from, to) {
	var transition = to.transitions[property];
	if (!transition) {
		transition = from && from.transitions && from.transitions[property] || this.getTransition(element, property, from, to);
		transition.value = from[property];
		transition.target = from[property];
		to.transitions[property] = transition;
	}
	transition.target = to[property];
	if (!transition.update(time)) {
		this.transitionCount++;
	}
	return transition.value;
}

Snapshot.prototype.getTransition = function(element, property, from, to) {
	const animation = new Animation;
	if (property === 'opacity') {
		animation.threshold = 0.01;
		animation.clamp = true;
	}
	//animation.tension = Math.max(300 - from.height, 50)
	return animation;
}

Snapshot.prototype.requestAnimationFrame = function(snapshot) {
	cancelAnimationFrame(this.animationFrame);
	snapshot.animationFrame = requestAnimationFrame((time) => {
		this.render(snapshot, time)
	});
}

Snapshot.prototype.render = function(snapshot, time) {
	if (this.morph(snapshot, time)) {
		this.requestAnimationFrame(snapshot);
	} else {
		snapshot.reset()
	}
}

Snapshot.prototype.restore = function(snapshot) {
	this.forEach((measurement) => {
		if (!document.contains(measurement.element)) {
			measurement.hidden = false;
			measurement.restored = true;
			snapshot.set(measurement.element, {
				...measurement,
				hidden: true
			})
			var els = measurement.element.getElementsByTagName('*')
			for (var i = 0; i < els.length; i++) {
				snapshot.set(els[i], {
					...(this.get(els[i])),
					hidden: false
				})
			}
			document.body.appendChild(measurement.element);
		}
	})
}

Snapshot.prototype.mutate = function(callback) {
	const snapshot = new Snapshot(this.element, true)
	for (var property in this) {
		if (this.hasOwnProperty(property) && typeof this[property] == 'function') {
			snapshot[property] = this[property];
		}
	}
	requestAnimationFrame((time) => {
		this.reset();
		callback()
		snapshot.measure(snapshot.element)
		this.restore(snapshot)
		snapshot.normalize(snapshot.element, this, snapshot.snapshot(snapshot.element.parentNode, {}), time);
		this.render(snapshot, time)
	})
	return snapshot;
}

Snapshot.prototype.getAppearanceStyles = function(to, from) {
	return {
		opacity: 0,
		translateX: 100,
		translateY: -100,
	}
}
Snapshot.prototype.getDisappearanceStyles = function(to, from) {
	return {
		opacity: 0,
		translateY: -100,
	}
}