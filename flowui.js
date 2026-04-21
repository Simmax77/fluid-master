// ======================================================================
// flowui.js — UI widgets for the volumetric flow simulation
// Ported from flow-master/ui.js, namespaced to avoid conflicts
// ======================================================================
'use strict';

var FlowHuePicker = function (canvas, changeCallback) {
    var context = canvas.getContext('2d');
    var hue = 0.0;
    changeCallback(hue);

    var spectrumCanvas = document.createElement('canvas');
    spectrumCanvas.width = canvas.width;
    spectrumCanvas.height = canvas.height;
    var spectrumContext = spectrumCanvas.getContext('2d');

    var imageData = spectrumContext.createImageData(canvas.width, canvas.height);
    for (var y = 0; y < canvas.height; y += 1) {
        for (var x = 0; x < canvas.width; x += 1) {
            var angle = Math.atan2(y - canvas.height / 2, x - canvas.width / 2) + Math.PI;
            var color = flowHsvToRGB(angle / (2.0 * Math.PI), FLOW_HUE_PICKER_SATURATION, FLOW_HUE_PICKER_VALUE);
            imageData.data[(y * canvas.width + x) * 4] = color[0] * 255;
            imageData.data[(y * canvas.width + x) * 4 + 1] = color[1] * 255;
            imageData.data[(y * canvas.width + x) * 4 + 2] = color[2] * 255;
            imageData.data[(y * canvas.width + x) * 4 + 3] = 255;
        }
    }
    spectrumContext.putImageData(imageData, 0, 0);

    var redraw = function () {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save();
        context.fillStyle = 'black';
        context.beginPath();
        context.arc(canvas.width / 2, canvas.height / 2, FLOW_HUE_OUTER_RADIUS, 0, Math.PI * 2, false);
        context.arc(canvas.width / 2, canvas.height / 2, FLOW_HUE_INNER_RADIUS, 0, Math.PI * 2, true);
        context.fill();
        context.globalCompositeOperation = 'source-in';
        context.drawImage(spectrumCanvas, 0, 0);
        context.restore();
        context.globalCompositeOperation = 'source-over';

        var startAngle = (hue - 0.5) * Math.PI * 2 - FLOW_HUE_HIGHLIGHTER_ANGLE_OFFSET;
        var endAngle = (hue - 0.5) * Math.PI * 2 + FLOW_HUE_HIGHLIGHTER_ANGLE_OFFSET;
        context.beginPath();
        context.arc(canvas.width / 2, canvas.height / 2, FLOW_HUE_INNER_RADIUS - FLOW_HUE_HIGHLIGHTER_RADIUS_OFFSET, startAngle, endAngle, false);
        context.arc(canvas.width / 2, canvas.height / 2, FLOW_HUE_OUTER_RADIUS + FLOW_HUE_HIGHLIGHTER_RADIUS_OFFSET, endAngle, startAngle, true);
        context.closePath();
        var color = flowHsvToRGB(hue, FLOW_HUE_HIGHLIGHTER_SATURATION, FLOW_HUE_HIGHLIGHTER_VALUE);
        var rgbString = flowRgbToString(color);
        context.strokeStyle = rgbString;
        context.lineWidth = FLOW_HUE_HIGHLIGHTER_LINE_WIDTH;
        context.stroke();
    };
    redraw();

    this.getHue = function () { return hue; };

    this.setHue = function (newHue) {
        hue = newHue;
        changeCallback(hue);
        redraw();
    };

    var mousePressed = false;

    canvas.addEventListener('mousedown', function (event) {
        var mouseX = flowGetMousePosition(event, canvas).x;
        var mouseY = flowGetMousePosition(event, canvas).y;
        var xDistance = canvas.width / 2 - mouseX;
        var yDistance = canvas.height / 2 - mouseY;
        var distance = Math.sqrt(xDistance * xDistance + yDistance * yDistance);
        if (distance < FLOW_HUE_OUTER_RADIUS) {
            mousePressed = true;
            onChange(event);
        }
    });
    document.addEventListener('mouseup', function () { mousePressed = false; });
    document.addEventListener('mousemove', function (event) {
        if (mousePressed) onChange(event);
    });

    canvas.addEventListener('touchstart', function (event) {
        var mouseX = flowGetMousePosition(event, canvas).x;
        var mouseY = flowGetMousePosition(event, canvas).y;
        var xDistance = canvas.width / 2 - mouseX;
        var yDistance = canvas.height / 2 - mouseY;
        var distance = Math.sqrt(xDistance * xDistance + yDistance * yDistance);
        if (distance < FLOW_HUE_OUTER_RADIUS) {
            mousePressed = true;
            onChange(event);
        }
    }, {passive: false});
    document.addEventListener('touchend', function () { mousePressed = false; });
    document.addEventListener('touchmove', function (event) {
        if (mousePressed) onChange(event);
    }, {passive: false});

    var onChange = function (event) {
        var mouseX = flowGetMousePosition(event, canvas).x;
        var mouseY = flowGetMousePosition(event, canvas).y;
        var angle = Math.atan2(mouseY - canvas.width / 2, mouseX - canvas.width / 2) + Math.PI;
        hue = angle / (Math.PI * 2.0);
        changeCallback(hue);
        redraw();
    };
};

var flowClamp = function (x, min, max) {
    return Math.max(min, Math.min(max, x));
};

var FlowSlider = function (element, min, max, initialValue, changeCallback) {
    var div = element;
    var innerDiv = document.createElement('div');
    innerDiv.style.position = 'absolute';
    innerDiv.style.height = div.offsetHeight + 'px';
    div.appendChild(innerDiv);
    var color = 'rgba(255,255,255,0.9)';
    var value = initialValue;

    this.setColor = function (newColor) {
        color = newColor;
        redraw();
    };
    this.getValue = function () { return value; };
    this.setValue = function (newValue) {
        value = flowClamp(newValue, min, max);
        changeCallback(value);
        redraw();
    };

    var mousePressed = false;
    var redraw = function () {
        var fraction = (value - min) / (max - min);
        innerDiv.style.background = color;
        innerDiv.style.width = fraction * div.offsetWidth + 'px';
        innerDiv.style.height = div.offsetHeight + 'px';
    };
    redraw();

    div.addEventListener('mousedown', function (event) {
        mousePressed = true;
        onChange(event);
    });
    document.addEventListener('mouseup', function () { mousePressed = false; });
    document.addEventListener('mousemove', function (event) {
        if (mousePressed) onChange(event);
    });

    div.addEventListener('touchstart', function (event) {
        mousePressed = true;
        onChange(event);
    }, {passive: false});
    document.addEventListener('touchend', function () { mousePressed = false; });
    document.addEventListener('touchmove', function (event) {
        if (mousePressed) onChange(event);
    }, {passive: false});

    var onChange = function (event) {
        var mouseX = flowGetMousePosition(event, div).x;
        value = flowClamp((mouseX / div.offsetWidth) * (max - min) + min, min, max);
        changeCallback(value);
        redraw();
    };
};

var FlowButtons = function (elements, changeCallback) {
    var activeElement = elements[0];
    var color;

    this.setColor = function (newColor) {
        color = newColor;
        refresh();
    };

    this.setActive = function (index) {
        if (index >= 0 && index < elements.length) {
            activeElement = elements[index];
            changeCallback(index);
            refresh();
        }
    };

    var refresh = function () {
        for (var i = 0; i < elements.length; ++i) {
            if (elements[i] === activeElement) {
                elements[i].classList.add('active');
                elements[i].style.background = color || 'var(--accent-color)';
                elements[i].style.color = '#fff';
            } else {
                elements[i].classList.remove('active');
                elements[i].style.background = '';
                elements[i].style.color = '';
            }
        }
    };

    for (var i = 0; i < elements.length; ++i) {
        (function () {
            var index = i;
            var clickedElement = elements[i];
            elements[i].addEventListener('click', function () {
                if (activeElement !== clickedElement) {
                    activeElement = clickedElement;
                    changeCallback(index);
                    refresh();
                }
            });
        }());
    }
};
