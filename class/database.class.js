const { Pool } = require('pg');

'use strict';

class Database {
    constructor(config, rejectEmpty = false, limitQueryExecution = true) {
        this._config = config;
        this._rejectEmpty = config.rejectEmpty || rejectEmpty;
        this._limitQueryExecution = limitQueryExecution;
        
        const dbConfig = config.database || config;

        this._pool = new Pool(dbConfig);
    };

    /**
     *	Expose pg pool
     *	@returns {Object} current pool
     * */
    connection() {
        return this._pool;
    };

    /**
     *	Escape undefined in args as null.
     * 	@param {any[]} args - arguments to be passed into query
     * 	@returns {any[]} escaped args
     * */
	escapeUndefined(args){
		if(!(args instanceof Object)){
			return args === undefined ? null : args;
		}

		if (Array.isArray(args)) {
            return args.map(arg => arg === undefined ? null : arg);
        }

		// If it's an object (though usually args is array for query)
		for(const key in args){
			if(args[key] === undefined){
				args[key] = null;
			}
		}

		return args;
	};

   /**
     *	Execute query with arguments
     * 	@param {string} sql - sql query
     * 	@param {any[]} args - arguments to be passed into query
     * 	@param {Object} options - extra options
     * 	@returns {Object[]} sql query result (rows)
     * */
     query(sql, args, { stripMeta = true, dateStrings = true, userId = null, isDelete = false, message = null, connection } = {}) {
        return new Promise(async (resolve, reject) => {
            // Limit query executed only for data manipulation only
            if (this._limitQueryExecution && sql.match(/(CREATE|TRUNCATE|GRANT|DROP|ALTER|SHUTDOWN)($|[\s\;])/i)) {
                reject({
                    errno: 0,
                    msg: "SQL Query contains forbidden words : CREATE,TRUNCATE,GRANT,DROP,ALTER,SHUTDOWN",
                });
                return;
            }

            let client;
            try {
                // use existing connection (client) if available, otherwise get one from pool
                client = connection || await this._pool.connect();

                // Convert ? placeholders to $1, $2, etc.
                let paramIndex = 1;
                const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

                // Handle session variables if needed (PostgreSQL uses SET LOCAL or similar, but @variable is MySQL specific)
                // PostgreSQL doesn't support @variables in the same way for connection session state usually.
                // However, for compatibility, if the user relies on these, we might need a different approach.
                // For now, I will comment out the MySQL-specific variable setting to prevent errors,
                // as converting them to PG 'SET LOCAL my.var = val' requires more context.
                
                /* 
                // MySQL specific variable setting - disabled for PG compatibility
                if (sql.match(/(INSERT|UPDATE|DELETE)($|[\s\;])/i)) {
                    if (userId) {
                        // await client.query('SET LOCAL app.user_id = $1', [userId]); 
                    }
                    // ...
                }
                */

                const cleanArgs = this.escapeUndefined(args);
                const res = await client.query(convertedSql, cleanArgs);

                // Check for empty result if configured
                if ((res.rowCount === 0 && !res.rows.length) && this._rejectEmpty) {
                    // For SELECT, rowCount is number of rows. For INSERT/UPDATE, it's affected rows.
                    // If it's a SELECT and no rows, reject.
                    if (sql.trim().toUpperCase().startsWith('SELECT')) {
                        reject({ code: 'EMPTY_RESULT' });
                        return;
                    }
                }
                
                resolve(res.rows);
            }
            catch (error) {
                reject(error);
            }
            finally {
                if (client && !connection) {
                    client.release();
                }
            }
        });
    };

    /**
     *	Execute query batch - PG doesn't have a direct 'batch' equivalent in the confusing MariaDB sense (which is mostly multiple statements).
     *  We'll map it to standard query for now or simple transaction.
     * 	@param {string} sql
     * 	@param {any[]} args
     * */
    batch(sql, args, stripMeta = true, dateStrings = true) {
         return new Promise(async (resolve, reject) => {
             let client;
             try {
                 client = await this._pool.connect();
                 await client.query('BEGIN');
                 
                 const results = [];
                 // Convert ? to $n
                 let paramIndex = 1;
                 const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

                 if(Array.isArray(args) && Array.isArray(args[0])) {
                     for(const argRow of args) {
                         const cleanRow = this.escapeUndefined(argRow);
                         const res = await client.query(convertedSql, cleanRow);
                         results.push(res.rows);
                     }
                 } else {
                     // Single execution
                     const cleanArgs = this.escapeUndefined(args);
                     const res = await client.query(convertedSql, cleanArgs);
                     results.push(res.rows);
                 }

                 await client.query('COMMIT');
                 resolve(results.flat());
             } catch (err) {
                 if (client) await client.query('ROLLBACK');
                 reject(err);
             } finally {
                 if (client) client.release();
             }
         });
    };

    /**
     *	Debug SQL query with arguments (Approximate for logging)
     * */
	debug(sql, args) {
		if(!Array.isArray(args)){
			args = [args];
		}

		// Reconstruct query with values for display purposes
        let debugSql = sql;
        for (const arg of args) {
            const val = typeof arg === 'string' ? `'${arg}'` : arg;
            debugSql = debugSql.replace('?', val);
        }

		return debugSql.replace(/[\t\n\ ]+/g,' ');
	}

    /**
     *	Simple string escape for inputs (Client-side mostly)
     *  NOTE: Use parameterized queries instead!
     * */
    escape(string) {
        // PG doesn't expose escape easily. Simple replacement for quotes.
        if (typeof string !== 'string') return string;
        return `'${string.replace(/'/g, "''")}'`;
    }

    /**
     *	End pool
     * */
    async end() {
        await this._pool.end();
    };
}

module.exports = Database;
