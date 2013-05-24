/* ------------------------------------------------------------------------
    Title:          Tiny Doodle
    
    Version:        0.2
    URL:            http://tinydoodle.com/
    
    Description:
        Tiny Doodle is an exercise in learning about <canvas>.
        Event handlers are attached the to <canvas> elemet for both
        mouse and touch input devices. The user can doodle away on the
        <canvas>, clear and save the resulting doodle.
        
        Saving the doodle extracts the canvas data in base64 format,
        POST's the string to a Python service which stores it in a 
        database.
    
    Author:         Andrew Mason
    Contact:        a.w.mason at gmail dot com
    Author's Site:  http://coderonfire.com/
    
    Requirements:
        * Jquery 1.3+
    
    Changelog:
        0.1 (28th May 2009)
            - First demo build
        0.2 (30th May 2009)
            - Addded Pen and Eraser
            - Commented code
            - 
    
    Todo:
        * Error checking and handling
        * Clean up code
        * Add yellow throber to indicate added images
        * Add share links
    
    Licence:
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

------------------------------------------------------------------------ */

// Run once the DOM is ready
$(document).ready(function () {
    doodle.init();
});

var doodle = {
    // Define some variables
    'drawing':          false,
    'linethickness':    1,
    'updating':         false,
    'saveID':           '#save',
    'newID':            '#new',
    'penID':            '#pen',
    'eraserID':         '#eraser',
    'colour':           '#000',
    'noticeID':         '#notification',
    'loaded_id':         false
    
};

doodle.init = function() {
    // Collect elements from the DOM and set-up the canvas
    doodle.canvas = $('#doodle_canvas')[0];
    doodle.context = doodle.canvas.getContext('2d');
    doodle.oldState = doodle.context.getImageData(0, 0, 320, 240);
    
    // Check if there is data in the domain cookie and try to load doodles
    if ($.cookie('doodles')) {
        doodle.loadDoodles($.cookie('doodles'));
    }
    
    doodle.newDoodle();
    
    $('#share div').hide();    
    // Set up the share links
    $('#share h2').bind('click', function() {
        $('#share div').slideToggle('normal');
    });

    
    // Mouse based interface
    $(doodle.canvas).bind('mousedown', doodle.drawStart);
    $(doodle.canvas).bind('mousemove', doodle.draw);
    $(doodle.canvas).bind('mouseup', doodle.drawEnd);
    $(doodle.canvas).bind('mouseleave', function() {
        doodle.context.putImageData(doodle.oldState, 0, 0);
    });
    $('body').bind('mouseup', doodle.drawEnd);
    
    // Touch screen based interface
    $(doodle.canvas).bind('touchstart', doodle.drawStart);
    $(doodle.canvas).bind('touchmove', doodle.draw);
    $(doodle.canvas).bind('touchend', doodle.drawEnd);
    
    // Add save event to save button
    $(doodle.saveID).bind('click', doodle.saveImage);
    
    // Add clear canvas event
    $(doodle.newID).bind('click', doodle.newDoodle);
    
    // Add Pen selection event
    $(doodle.penID).bind('click', doodle.pen);
    $(doodle.eraserID).bind('click', doodle.eraser);
    
    // Brush size
    $(window).bind('keydown', doodle.changeBrushSize);
    
};

doodle.loadDoodles = function(cookie) {
    var keys = cookie.split(",");
    for (var i = 0; i < keys.length; i++) {
        doodle.newDoodle('/thumb?id='+keys[i]+'&rnd='+Math.random(), keys[i]);
    }
}

doodle.saveImage = function(ev) {
    // Extract the Base64 data from the canvas and post it to the server
    base64 = doodle.canvas.toDataURL("image/png");
    if(!doodle.updating) {
        $.post('/save', {img: base64}, function(data) {doodle.updateThumb(data)});
    } else {
        $.post('/save', {img: base64, key: doodle.loaded_id}, function(data) {doodle.updateThumb(data)});
    }
}


// Change the size of the brush
doodle.changeBrushSize = function(ev) {
    if (ev.keyCode === 219 && doodle.linethickness > 1) {
        doodle.linethickness -= 1;
        doodle.draw(ev);
    }
    
    if (ev.keyCode === 221 && doodle.linethickness < 1000) {
        doodle.linethickness += 1;
        doodle.draw(ev);
    }
}

doodle.updateThumb = function(data) {
    // Notify the user that the image has been saved
    //$(doodle.noticeID).html('Saved');

    var thumb = $('img.active');
    // Reset the thumb image
    // Note: a random number is added to the image to prevent caching
    thumb.attr('src', '/thumb?id='+data+'&rnd='+Math.random());
    thumb.attr('id', 'i'+data);
    $('img.active').bind('click', doodle.loadImage);
    
    // Save doodle ID to a cookie
    if (doodle.loaded_id !== data) {
        var keys;
        if ($.cookie('doodles')) {
            keys = $.cookie('doodles') + ',' + data;
        } else {
            keys = data;
        }
        $.cookie('doodles', keys);
    }
    
    // Store doodle ID
    doodle.loaded_id = data;
    
    // The doodle has been saved, update from here on
    doodle.updating = true;
}

doodle.newDoodle = function(src, id) {
    doodle.clearCanvas();
    if (!src) {
        src = '/static/images/blank.gif';
    }
    
    if (!id) {
        id = '';
    }
    // Build an empty thumb
    thumb_html = '<img class="active" src="'+src+'" id="i'+id+'" width="32" height="24" />';

    // Add the thumb to the DOM then bind click event
    $('#output').append(thumb_html);
    $('#output img').bind('click', doodle.loadImage);
    //$('img.active').bind('click', doodle.loadImage);
}

doodle.loadImage = function(event) {
    // Stop from following link
    event.preventDefault();
    
    // If the current doodle is loaded, do nothing
    if ($(this).hasClass('active')) {
        return;
    }
    
    // Clear the canvas
    doodle.clearCanvas();
    
    // Load saved image onto the canvas
    if ($(this).attr('id')) {
        doodle.loaded_id = $(this).attr('id').slice(1);
        var img_src = '/image?id=' + doodle.loaded_id + '&rnd='+Math.random();
        var img = new Image();
        img.src = img_src;
        
        // Wait for image to finish loading before drawing to canvas
        img.onload = function() {
            doodle.context.drawImage(img, 0, 0);
            doodle.oldState = doodle.context.getImageData(0, 0, 320, 240);
        };
        
        // Flag that user is updating a saved doodle
        doodle.updating = true;
    } else {
        
    }
    
    
    // Add active class to selected thumb
    $(this).addClass('active');  
    


}

doodle.clearCanvas = function(ev) {
    // Clear existing drawing
    doodle.context.clearRect(0,0, doodle.canvas.width, doodle.canvas.height);
    doodle.canvas.width = doodle.canvas.width;
    
    // Set the background to white.
    // then reset the fill style back to black
    doodle.context.fillStyle = '#FFFFFF';
    doodle.context.fillRect(0, 0, doodle.canvas.width, doodle.canvas.height);
    doodle.context.fillStyle = '#000000';
    
    // Remove active class from other thumbs
    $('#output IMG').each(function() {
        $(this).removeClass('active');
    });
    
    // Clear state
    doodle.oldState = doodle.context.getImageData(0, 0, 320, 240);
    
    // Set the drawning method to pen
    doodle.pen();
    
    // Flag that the user is working on a new doodle
    doodle.updating = false;
}

doodle.drawStart = function(ev) {
    ev.preventDefault();
    // Calculate the current mouse X, Y coordinates with canvas offset
    var x, y;
    x = ev.pageX - $(doodle.canvas).offset().left;
    y = ev.pageY - $(doodle.canvas).offset().top;
    doodle.drawing = true;
    doodle.context.lineWidth = doodle.linethickness;

    // Store the current x, y positions
    doodle.oldX = x;
    doodle.oldY = y;
}

doodle.draw = function(event) {

    // Calculate the current mouse X, Y coordinates with canvas offset
    var x, y;
    x = event.pageX - $(doodle.canvas).offset().left;
    y = event.pageY - $(doodle.canvas).offset().top;
    
    // If the mouse is down (drawning) then start drawing lines
    if(doodle.drawing) {
        doodle.context.putImageData(doodle.oldState, 0, 0);
        doodle.context.strokeStyle = doodle.colour;
        doodle.context.beginPath();
        doodle.context.moveTo(doodle.oldX, doodle.oldY);
        doodle.context.lineTo(x, y);
        doodle.context.closePath();
        doodle.context.stroke();
        doodle.oldState = doodle.context.getImageData(0, 0, 320, 240);
    } else {
    
        doodle.context.putImageData(doodle.oldState, 0, 0);
        
        doodle.context.beginPath();
        doodle.context.arc(x, y, doodle.linethickness, 0, 2 * Math.PI, false);
        
        doodle.context.lineWidth = 3;
        doodle.context.strokeStyle = '#fff';
        doodle.context.stroke();
     
        doodle.context.lineWidth = 1;
        doodle.context.strokeStyle = '#000';
        doodle.context.stroke();
    
    }
    
    // Store the current X, Y position
    doodle.oldX = x;
    doodle.oldY = y;
    
};


// Finished drawing (mouse up)
doodle.drawEnd = function(ev) {
    doodle.drawing = false;
}

// Set the drawing method to pen
doodle.pen = function() {
    // Check if pen is already selected
    if($(doodle.penID).hasClass('active')) {
        return;
    }
    // Change color and thickness of the line
    doodle.colour = '#000000';
    
    // Flag that pen is now active
    $(doodle.penID).toggleClass('active');
    
    // Remove active state from eraser
    $(doodle.eraserID).removeClass('active');
}

// Set the drawing method to eraser
doodle.eraser = function() {
    // Check if pen is already selected
    if($(doodle.eraserID).hasClass('active')) {
        return;
    }
    // Change color and thickness of the line
    doodle.colour = '#FFFFFF';
    
    // Flag that eraser is now active
    $(doodle.eraserID).toggleClass('active');
    
    // Remove active state from pen
    $(doodle.penID).removeClass('active');
}