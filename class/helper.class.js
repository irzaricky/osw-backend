import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { fileURLToPath } from 'url';
import Joi from 'joi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class commonHelper {
	msToHms(duration, withms = false) {
		let milliseconds = parseInt((duration % 1000) / (+withms || 1)),
			seconds = parseInt((duration / 1000) % 60),
			minutes = parseInt((duration / (1000 * 60)) % 60),
			hours = parseInt((duration / (1000 * 60 * 60)) % 24);

		hours = (hours < 10) ? "0" + hours : hours;
		minutes = (minutes < 10) ? "0" + minutes : minutes;
		seconds = (seconds < 10) ? "0" + seconds : seconds;

		return withms
			? hours + ":" + minutes + ":" + seconds + "." + milliseconds
			: hours + ":" + minutes + ":" + seconds;
	}

	secondsToHms(duration, withms = false){
		return this.msToHms(this.secondsToMs(duration), withms);
	};

	secondsToMs(secs){
		return secs * 1000;
	};

	msToSeconds(ms, asMs = true){
		return Math.round(ms / 1000) * (asMs ? 1000 : 1);
	};

	isValidDate(_date){
		return dayjs(_date).isValid();
	};

	formatDate(_date, _format = 'YYYY-MM-DD HH:mm:ss'){
		if(!this.isValidDate(_date) || _date == null){
			return '';
		}

		return dayjs(_date).format(_format);
	};

	arrayFindByValue(arr, key, value){
		if(!Array.isArray(arr)){
			return false;
		}

		for(const item of arr){
			if(item[key] === value){
				return item;
			}
		}

		return null;
	};

	sleep(ms){
		return new Promise(resolve => setTimeout(resolve, ms))
	};

	round(num, dec = 2){
		const pow = Math.pow(10, dec);
		return Math.round((num + Number.EPSILON) * pow) / pow;
	};

	// change to must format timestamp ex 12:00:00
	hmsToMs(hms){
		// if(!(date.isValid(hms, 'HH:mm:ss') || date.isValid(hms, 'HH:mm:ss.SSS') || date.isValid(hms, 'HH:mm:ss.SS') || date.isValid(hms, 'HH:mm:ss.S'))){
		// 	throw `Invalid Hms format ${hms}`;
		// }

		const comp = hms.split(/[\:|\.]+/);
		const multipliers = [
				3600000, // hours
				60000, // minutes
				1000, // seconds
				1 // ms
			];

		return comp.reduce((acc, val, idx) => acc + (+val * multipliers[idx]), 0);
	};

	hmsToSeconds(time) {
		return this.hmsToMs(time) / 1000;
	};

	clockHMSDiff(first, last, assumeTommorow = true){
		const prefixDate = this._prefixDate || '1970-01-01';
		const dayInMs = 24 * 3600 * 1000;

		//use ISO String to keep Date from being adjusted by timezone
		const _date = {
				first : new Date(`${prefixDate}T${first}Z`),
				last : new Date(`${prefixDate}T${last}Z`)
			};

		// this method accept only start time is less than end time
		// otherwise assume the last time is tommorow, unless assumeTommorow is false
		if(_date.first > _date.last && assumeTommorow){
			_date.last = new Date(_date.last.getTime() + dayInMs);
		}

		delete this._prefixDate;

		return _date.last - _date.first;
	};

	clockHMSIsBetween(needle, first, last, tolerance = 0){
		const prefixDate = this._prefixDate || '1970-01-01';
		const dayInMs = 24 * 3600 * 1000;

		//use ISO String to keep Date from being adjusted by timezone
		const _date = {
				needle : new Date(`${prefixDate}T${needle}Z`),
				first : new Date(`${prefixDate}T${first}Z`),
				last : new Date(`${prefixDate}T${last}Z`),
			};

		//tolerance in ms
		if(tolerance){
			if(tolerance.seconds){
				tolerance = tolerance.seconds * 1000;
			}

			_date.first = new Date(_date.first.getTime() - tolerance);
			_date.last = new Date(_date.last.getTime() + tolerance);
		}

		// if end time is less than start time, assume end time is in the next day
		if(_date.last <= _date.first){
			//if needle is less than start time and end time, assume needle is in the next day
			if(_date.needle < _date.last && _date.needle < _date.first){
				_date.needle = new Date(_date.needle.getTime() + dayInMs); //add a day
			}

			_date.last = new Date(_date.last.getTime() + dayInMs);//add a day
		}

		delete this._prefixDate;

		return _date.first < _date.needle && _date.last > _date.needle;
	};

	set(key, val){
		this[`_${key}`] = val;
		return this;
	};

	excelDatetime(value){
		const self = this;
		const excelConstants = {
			_daysOffset: 25569, // number of days between 1970-01-01 and 1900-01-01
			_1seconds: 0.0000115740, // 1 second in excel format
			days: Math.floor(value), // extract integer parts
			seconds: value - Math.floor(value), // extract decimal parts
		};

		const _date = (excelConstants.days - excelConstants._daysOffset) * 86400 * 1000;
		const _seconds = Math.round(1000 * excelConstants.seconds / excelConstants._1seconds);

		return {
			date: self.formatDate(new Date(_date), 'YYYY-MM-DD'),
			time: self.msToHms(_seconds),
			timestamp: _date + _seconds, // number of elapsed ms after 1970-01-01
		};
	};

	addTolerance(value, tolerance){
		const self = this;
		const dateStart = dayjs(value).isValid() ? new Date(value):value;

		const start = dayjs(dateStart).add(tolerance, 'minute');
		const startWithTolerance = self.formatDate(start)

		return startWithTolerance
	}
}

class helper extends commonHelper {
	sendResponse(res, body, status = null) {
		/*
		 *	body : {
		 *		status	: true/false,
		 *		error	: ....,
		 *		data	: ....,
		 *	};
		 */

		try {
			res.status(status || (body && body.code) || (body && body.status ? 200 : 400));
			res.setHeader('Content-Type', 'application/json')
			res.send(body);

			return true;
		} catch (error) {
			console.error('helper sendResponse Error :', error);

			res.status(401);
			res.setHeader('Content-Type', 'application/json')
			res.send({
				status: false,
				error: String(error),
			});

			return false;
		}
	};

	mergeResponses(...responses){
		const tmp = {};

		for(const item of responses){
			if(item.status != undefined){
				if(tmp.status == undefined){
					tmp.status = true;
				}

				tmp.status &= item.status;
			}

			if(item.error != undefined){
				if(tmp.error == undefined){
					tmp.error = [];
				}

				tmp.error.push(item.error);
			}


			if(item.data != undefined){
				if(tmp.data == undefined){
					tmp.data = [];
				}

				tmp.data.push(item.data);
			}

		}

		return {
			status: Boolean(tmp.status),
			error: tmp.error,
			data: tmp.data,
		};
	};

	isBetweenTime(current, start, finish) {
		/*** Check time if current is between start & finish, using start as anchor ***/
		/*** time in HH:mm:ss format ***/
		/*** Result is valid only if time range is belows or equals 24Hours ***/
		const reference = dayjs().format("YYYY-MM-DD "); // to avoid race condition

		start = new Date(reference + start);
		finish = new Date(reference + finish);
		current = new Date(reference + current);

		const addedDays = {
			finish: finish <= start ? 1 : 0,
			current: current < finish && current < start ? 1 : 0,
		};

		current = dayjs(current).add(addedDays.current, 'day').toDate();
		finish = dayjs(finish).add(addedDays.finish, 'day').toDate();

		return current >= start && current <= finish;
	};

	// this method is to retrieve a value inside nested object without triggering error if the keys dont exist
	getObjectValue(obj, ...keys) {
		for (let idx = 0; idx < keys.length; idx++) {
			if (obj == undefined || obj == null || !keys[idx] in obj){
				return undefined;
			}

			obj = obj[keys[idx]];
		}

		return obj;
	};

	checkUndefined(variable, defaultValue = false, check = undefined) {
		return (variable === check)
			? ((defaultValue === false) ? ('') : (defaultValue))
			: (variable);
	};

	dateAddition(date, days) {
		let ms = days * 86400 * 1000;
		let addedDate = date.getTime() + ms;

		return new Date(addedDate);
	};

	objectToArray(obj) {
		return Object.keys(obj)
			.map(key => obj[key]);
	};

	getRoutersSync(__path, __extension) {
		let files = {};

		//using sync, because it's only run when server is starting up and I dont want to get unnecessary headache
		fs.readdirSync(__path)
			.forEach(file => {
				const stats = fs.statSync(__path + '/' + file);

				if (stats.isFile() && path.extname(file) === __extension) {
					files[path.basename(file, path.extname(file))] = path.resolve(__path, file);
				} else if (stats.isDirectory()) {
					//if file is a directory, recursively get all files inside it and add them into object
					const tmp = this.getRoutersSync(path.resolve(__path, file), __extension);
					for (let key in tmp) {
						files[path.basename(file, path.extname(file)) + '/' + key] = tmp[key];
					}
				}
			});

		return files;
	};

	getFilesInFolderSync(__path, __extension = null) {
		let files = [];

		//fuxk, gonna use sync anyway
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

	getAllRouters(__path) {
		return {
			'/': this.getRoutersSync(__path, '.js'),
		};
	};

	getPagination(params) {
		const limit = parseInt(params.limit) || 10;
		const page = parseInt(params.page) || 1;
		const offset = (page - 1) * limit;

		return { limit, page, offset };
	};

	getPaginationData(rows, count, page, limit) {
		return {
			rows,
			count,
			page,
			limit,
			totalPages: Math.ceil(count / limit)
		};
	};

	checkMandatory(data, fields) {
		const missing = [];
		for (const field of fields) {
			if (!data[field]) {
				missing.push(field);
			}
		}

		if (missing.length > 0) {
			return {
				status: false,
				error: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`,
				code: 400
			};
		}

		return { status: true };
	};

    validate(data, schema) {
        const { error, value } = schema.validate(data, { abortEarly: false });
        if (error) {
            return {
                status: false,
                error: error.details.map(x => x.message).join(', '),
                code: 400
            };
        }
        return { status: true, value };
    }

}

export default new helper();
