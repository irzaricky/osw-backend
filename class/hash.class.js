import crypto from 'crypto';

const _salt = {
	prefix: '',
	suffix: '',
};

const _getHash = function(text, algorithm){
	const hash = crypto.createHash(algorithm);
	hash.update(`${_salt.prefix}${text}${_salt.suffix}`);

	return hash.digest('hex');
};

class HASH{
	constructor(_saltPrefix = 'muerte', _saltSuffix = '09872651'){
		_salt.prefix = _saltPrefix;
		_salt.suffix = _saltSuffix;
	}

	salt(prefix = '', suffix = ''){
		_salt.prefix = _saltPrefix;
		_salt.suffix = _saltSuffix;
	};

	md5(text){
		return _getHash(text, 'md5');
	};

	sha1(text){
		return _getHash(text, 'sha1');
	};

	sha256(text){
		return _getHash(text, 'sha256');
	};

	sha224(text){
		return _getHash(text, 'sha224');
	};

	sha384(text){
		return _getHash(text, 'sha384');
	};

	sha512(text){
		return _getHash(text, 'sha512');
	};

	randomString(length = 32, encoding = 'hex'){
		return crypto
			.randomBytes(length)
			.toString(encoding);
	};
}

export default new HASH();
