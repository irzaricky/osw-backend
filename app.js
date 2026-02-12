const createError = require('http-errors');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const loggerMorgan = require('morgan');
const cors = require('cors');

const app = express();
const server = require('http').Server(app);
require('express-ws')(app, server);

const config = require('./config/app.config.js');
const urlWebsite = 'site';

global.__basedir = __dirname;
global.__class_dir = __basedir + '/class';
global.__config_dir = __basedir + '/config';
global.__module_dir = __basedir + '/module';
global.__routes_dir = __basedir + '/routes';
global.__site_title = config.site.title;
global.__siteurl = config.site.url;
global.__publicurl = __siteurl + '/' + urlWebsite;
global.__random = require(__class_dir + '/hash.class.js').randomString(40, 'base64');
global.gEvents = new (require("events"))();

const helper = require(`${__class_dir}/helper.class.js`)


global.logger = require('pino')({
	timestamp: () => {
		//let _now = new Date();
		//let offset = _now.getTimezoneOffset() * 60 * 1000;
		//return `, "time": ${_now - offset}`;
		// 2017-07-31T18:31:14.140Z

		//return ', "time":' + format('%F %T %z', convert(now(), tz('Asia/Taipei')));
		// "time":2017-07-31 18:31:14 +0800

		return `, "time":"${helper.formatDate(new Date())}"`
		// 2017-07-31T10:31:14.000Z
	},
})

function getRoutersSync(__path, __extension) {
	const files = {};

	//using sync, because it's only run when server is starting up and I dont want to get unnecessary headache
	fs.readdirSync(__path)
		.forEach(file => {
			const stats = fs.statSync(__path + '/' + file);

			if (stats.isFile() && path.extname(file) === __extension) {
				files[path.basename(file, path.extname(file))] = path.resolve(__path, file);
			} else if (stats.isDirectory()) {
				//if file is a directory, recursively get all files inside it and add them into object
				const tmp = getRoutersSync(path.resolve(__path, file), __extension);
				for (let key in tmp) {
					files[path.basename(file, path.extname(file)) + '/' + key] = tmp[key];
				}
			}
		});

	return files;
};

function getFilesInFolderSync(__path, __extension = null) {
	const files = [];

	fs.readdirSync(__path)
		.forEach(file => {
			const stats = fs.statSync(__path + '/' + file);

			if (stats.isFile() && path.extname(file) === __extension) {
				files.push(file);
			} else if (stats.isFile() && __extension === null) {
				files.push(file);
			}
		});

	return files;
};

function getAllRouters(__path) {
	return {
		'/': getRoutersSync(__path, '.js'),
	};
};

if (config.debug) {
	app.use(loggerMorgan('dev'));
}

app.use(express.json({ limit : '100mb'}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use('/', express.static(path.join(__dirname, 'public')));
app.disable('x-powered-by');

// initialize express-session to allow us track the logged-in user across sessions.
app.use(session({
	key: 'user_sid',
	secret: __random,
	resave: false,
	saveUninitialized: false,
	cookie: {
		expires: 3600000
	}
}));

// This middleware will check if user's cookie is still saved in browser and user is not set, then automatically log the user out.
// This usually happens when you stop your express server after login, your cookie still remains saved in the browser.
app.use((req, res, next) => {
	if (req.session && req.session._menus) {
		res.locals._menus = req.session._menus;
	}

	if (req.cookies.user_sid && !req.session.token) {
		console.error("cookie exists but session doesn't");
		res.clearCookie('user_sid');
		res.clearCookie('token');
	}

	next();
});

app.use(cors());

app.use(function (req, res, next) {


	let original = res.send
	const chunks = [];

	//when using express
	res.send = function (chunk, encoding, callback) {
		chunks.push(chunk)
		original.apply(res, arguments);
		res.end()
	}

	res.on('finish', function () {
		if (!(res.statusCode >= 200 && res.statusCode < 400)) {

			let logContent = {};

			Object.assign(logContent, {
				url: req["originalUrl"],
				method: req["method"],
				ip: req["ip"]
			});

			if (req["headers"]["authorization"]) {
				try {
					Object.assign(logContent, {
						userName: req.decoded.u
					});
				} catch (err) { }
			}

			Object.assign(logContent, {
				request: req.body || {},
				response: chunks[0]
			});

			logger.error(logContent)
		}
	});

	let body = [];
	req.on('data', (chunk) => {
		body.push(chunk);
	}).on('end', () => {
		body = Buffer.concat(body).toString();
	});

	next();
});

//https://stackoverflow.com/questions/7067966/how-to-allow-cors
app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

	if (req.method === 'OPTIONS') {
		res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
		return res.status(200).json({});
	}

	next();
});


// ROUTERS SETTING
const routers = getAllRouters(__routes_dir);
for (const mainRoute in routers) {
	for (const subRoute in routers[mainRoute]) {
		app.use(`${mainRoute === '/' ? '' : mainRoute}/${subRoute}`, require(routers[mainRoute][subRoute]));
	}
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	//if it's api request, return json instead
	if (req.headers['content-type'] == 'application/json' || (req.headers['authorization'] && req.headers['authorization'].toLowerCase().includes('bearer '))) {
		res.status(404).send({
			status: false,
			error: "Sorry can't find this route!"
		});

		if (config.debug) {
			next(createError(404));
		}

		return;
	} else {
		next(createError(404));
	}
});

// error handler
app.use(function (err, req, res, next) {
	if (config.debug === 2 || config.debug === 'verbose') {
		console.error('This one is not found -->', req.method, req.originalUrl, err);
	}

	res.status(err.status || 500).send({
		status: false,
		error: err.status === 404 ? "Sorry can't find this route!" : err.message || "Internal Server Error"
	});
});

module.exports = {
	app,
	server,
	config,
};
