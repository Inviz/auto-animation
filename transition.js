
Animation = function(options) {
  this.done = false;
  this.clamp = false;
  this.value = 0;
  this.target = 1;
  this.delay = 0;
  this.immediate = false;

  this.startTime = undefined;
  this.time = undefined;

  this.duration = undefined;
  this.decay = undefined;

  this.tension = 42;
  this.friction = 12;
  this.precision = 0;
  this.mass = 1;
  this.threshold = 0.1;
  this.velocity = 0;
  Object.assign(this, options);
}

Animation.prototype.setValue = function (value) {
}

Animation.prototype.valueOf = function() {
  return this.value;
}

Animation.prototype.update = function(time) {
  let isFinished = false;
  let value = this.value;
  let velocity = this.velocity;
  if (this.time === void 0) {
    this.startTime = time;
    this.lastValue = value;
    this.time = time;
    this.from = value;
  }

  // Conclude animation if it's either immediate, or from-values match end-state
  if (this.immediate) {
    this.setValue(this.target)
    isFinished = true;
  } else {
    if (this.duration !== void 0) {
      /** Duration easing */
      value =
        this.from +
        this.easing((time - this.startTime) / this.duration) *
          (this.target - this.from)
      isFinished = time >= this.startTime + this.duration
    } else if (this.decay) {
      /** Decay easing */
      value =
        this.from +
        (this.velocity / (1 - 0.998)) *
          (1 - Math.exp(-(1 - 0.998) * (time - this.startTime)))
      isFinished = Math.abs(this.value - value) < 0.1
      if (isFinished) this.target = value
    } else {
      // If we lost a lot of frames just jump to the end.
      if (time > this.time + 64) this.time = time
      // http://gafferongames.com/game-physics/fix-your-timestep/
      let numSteps = Math.floor(time - this.time)
      if (this.delay) {
        const delayed = Math.min(this.delay, numSteps);
        this.delay -= delayed;
        numSteps -= delayed;
      }
      for (let i = 0; i < numSteps; ++i) {
        let force = -this.tension * (value - this.target)
        let damping = -this.friction * this.velocity
        let acceleration = (force + damping) / this.mass
        this.velocity = this.velocity + (acceleration * 1) / 1000
        value = value + (this.velocity * 1) / 1000
      }

      // Conditions for stopping the spring animation
      let isOvershooting =
        this.clamp && this.tension !== 0
          ? this.from < this.target
            ? value > this.target
            : value < this.target
          : false
      let isVelocityUnnoticable = Math.abs(this.velocity) <= this.threshold * 5
      let isDisplacementUnnoticable =
        this.tension !== 0
          ? Math.abs(this.target - value) <= this.threshold
          : true
      isFinished = isOvershooting || (isVelocityUnnoticable && isDisplacementUnnoticable)
    }

    if (isFinished) {
      // Ensure that we end up with a round value
      if (value !== this.target) value = this.target
    }
  }
  if (Math.abs(value - this.lastValue) > this.precision || isFinished) {
    this.setValue(value, isFinished)
    this.lastValue = value;
  }
  this.value = value
  this.time = time
  return isFinished;
}