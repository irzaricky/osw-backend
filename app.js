import createError from 'http-errors';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import loggerMorgan from 'morgan';
import cors from 'cors';
import { Server } from 'http';
import expressWs from 'express-ws';
import { config } from './config/app.config.js';
import hash from './class/hash.class.js';
import { EventEmitter } from 'events';
import helper from './class/helper.class.js';
import pino from 'pino';
import { fileURLToPath, pathToFileURL } from 'url';
import fileUpload from 'express-fileupload';
import { initCronJobs } from './cron/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = new Server(app);
expressWs(app, server);

const urlWebsite = 'site';

global.__basedir = __dirname;
global.__class_dir = __basedir + '/class';
global.__config_dir = __basedir + '/config';
global.__module_dir = __basedir + '/module';
global.__routes_dir = __basedir + '/routes';
global.__site_title = config.site.title;
global.__siteurl = config.site.url;
global.__publicurl = __siteurl + '/' + urlWebsite;
global.__random = hash.randomString(40, 'base64');
global.gEvents = new EventEmitter();

global.logger = pino({
	timestamp: () => {
		return `, "time":"${helper.formatDate(new Date())}"`
	},
})

// Helper functions moved to helper.class.js

if (config.debug) {
	app.use(loggerMorgan('dev'));
}

app.use(express.json({ limit : '100mb'}));
app.use(express.urlencoded({ extended: false }));
app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    abortOnLimit: true,
    createParentPath: true
}));
app.use(cookieParser());
app.use('/', express.static(path.join(__dirname, 'public')));
app.disable('x-powered-by');

// ensure req.body is always an object
app.use((req, res, next) => {
    req.body = req.body || {};
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
    const allowedOrigin = config.site.frontendUrl;
    const origin = req.headers.origin;

    if (origin === allowedOrigin) {
        res.header("Access-Control-Allow-Origin", origin);
    }
    
    res.header("Access-Control-Allow-Credentials", "true");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

	if (req.method === 'OPTIONS') {
		res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
		return res.status(200).json({});
	}

	next();
});


// ROUTERS SETTING
const routers = helper.getAllRouters(__routes_dir);
for (const mainRoute in routers) {
	for (const subRoute in routers[mainRoute]) {
		const routePath = routers[mainRoute][subRoute];
        // Dynamic import for ESM
        const routeModule = await import(pathToFileURL(routePath).href);
		app.use(`${mainRoute === '/' ? '' : mainRoute}/${subRoute}`, routeModule.default || routeModule);
	}
}

// Initialize Background Cron Jobs
initCronJobs();

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

export {
	app,
	server,
	config,
};
