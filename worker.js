var epeg = require('epeg');

process.on('message', function(msg){
	var image = new epeg.Image({path: msg.src});
	image = image.downsize(msg.w, msg.h);
	image.saveTo(msg.dst);
	if (msg.rotate) {
		require('child_process').exec('/usr/bin/exiftran -aip "'+msg.dst+'"',function() {
			process.send({'status' : 'OK'});
			console.log("Ending child process");
			process.exit();
		});
	} else {
		process.send({'status' : 'OK'});
		console.log("Ending child process");
		process.exit();
	}
});