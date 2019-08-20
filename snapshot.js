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
		hidden: parentSnapshot.hidden || styles.visibility === 'hidden' || (element.offsetWidth === 0 && element.offsetHeight === 0),
		cssText: element.style.cssText,
		cascadeGroup: element.getAttribute('data-cascade-group'),
		cascadeIndex: element.getAttribute('data-cascade-index') ? parseInt(element.getAttribute('data-cascade-index')) : undefined,
		cascadeDelay: element.getAttribute('data-cascade-delay') ? parseInt(element.getAttribute('data-cascade-delay')) : 200
	}
}

Snapshot.prototype.normalize = function (element, snapshot, parentSnapshot) {
	let from = snapshot.get(element);
	let to = this.get(element);

	if (!to && !from) return;

	if (to.cascadeGroup) {
		if (!this.groups[to.cascadeGroup])
			this.groups[to.cascadeGroup] = [];
		if (this.groups[to.cascadeGroup].cascadeIndex === undefined)
			this.groups[to.cascadeGroup].cascadeIndex = this.groups[to.cascadeGroup].length;
		this.groups[to.cascadeGroup].push(to);
	}

	if (from && !from.hidden && (!to || to.hidden)) {
		to = {
			...from,
			cssText: to.cssText,
			...this.getDisappearanceStyles(to, from)
		}
		if (to.cascadeGroup) {

		}
		this.set(element, to)
	}

	if ((!from || from.hidden) && !to.hidden) {
		from = {
			...to,
			hidden: true,
			...this.getAppearanceStyles(to, from)
		}
		snapshot.set(element, from)
	}

	if (to.display === 'inline') {
		return to;
	}
	
	// inherit ongoing transitions
	to.transitions = from.transitions || {};
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
			const childMeasurement = this.normalize(element.children[i], snapshot, to);
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

	to.repositioned = from.repositioned || (from && from.hidden !== to.hidden) || diffSize > 3 || diffDistance > 3// || from.fontSize !== to.fontSize || from.lineHeight !== to.lineHeight;
	
	return to;
}

Snapshot.prototype.reset = function(element) {
	this.forEach((measurement) => {
		measurement.element.style.cssText = measurement.cssText;
		measurement.element.classList.remove('morphing')
	});
}

Snapshot.prototype.measure = function(element, parent) {
	if (parent === undefined) {
		var parent = {left: 0, top: 0}
	}
	var measurements = this.snapshot(element, parent);
	measurements.transitions = {};
	measurements.element = element;
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
	snapshot.forEach((to, key) => {
		const from = this.measurements.get(key);
		if (to.repositioned) {
			const currentLeft    = snapshot.transition(to.element, 'left', time, from, to)
			const currentTop     = snapshot.transition(to.element, 'top', time, from, to)
			const currentWidth   = snapshot.transition(to.element, 'width', time, from, to)
			const currentHeight  = snapshot.transition(to.element, 'height', time, from, to)
			const parent         = to.parentSnapshot;
			const staticParent   = !parent.repositioned && parent.repositionedChildrenCount && parent.position === 'static';
			
			const parentLeft = to.left - parent.left + (staticParent ? parent.offsetLeft : 0);
			const offsetLeft = currentLeft - to.left;
			const parentOffsetLeft = (parent.transitions && parent.transitions.left ?  parent.transitions.left.value - parent.left : 0);
			const currentParentLeft = parentLeft + offsetLeft - parentOffsetLeft;
			
			const parentTop = to.top - parent.top + (staticParent ? parent.offsetTop : 0);
			const offsetTop = currentTop - to.top;
			const parentOffsetTop = (parent.transitions && parent.transitions.top ?  parent.transitions.top.value - parent.top : 0);
			const currentParentTop = parentTop + offsetTop - parentOffsetTop;
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
		}
	});
	return snapshot.transitionCount
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

Snapshot.prototype.mutate = function(callback) {
	const snapshot = new Snapshot(this.element, true)
	requestAnimationFrame((time) => {
		this.reset();
		callback()
		snapshot.measure(snapshot.element)
		snapshot.normalize(snapshot.element, this, snapshot.snapshot(snapshot.element.parentNode, {}));
		this.render(snapshot, time)
	})
	return snapshot;
}

Snapshot.prototype.getAppearanceStyles = function(to, from) {
	return {
		opacity: 0,
		top: to.top + 100,
	}
}
Snapshot.prototype.getDisappearanceStyles = function(to, from) {
	return {
		opacity: 0,
		top: from.top - 100,
	}
}