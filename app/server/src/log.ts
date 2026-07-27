import pino from 'pino';

/** Structured logger. JSON in production so Fly's log search can filter on
 *  fields; pretty-printed locally. Never log request bodies — they carry
 *  passwords, reset tokens and client data. */
export const log = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', 'passwordHash', 'token'],
    remove: true,
  },
  ...(process.env.NODE_ENV === 'production' ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
});
