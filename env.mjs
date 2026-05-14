export const AppEnv = {
    DBUser: process.env.DBUser ?? 'wangduanduan',
    DBPasswd: process.env.DBPasswd,
    DBAddr: process.env.DBAddr ?? '127.0.0.1',
    DBPort: process.env.DBPort ? parseInt(process.env.DBPort) : 3306,
    DBName: process.env.DBName ?? 'siphub',
    LogLevel: process.env.LogLevel ?? 'debug',
    QueryLimit: process.env.QueryLimit ? parseInt(process.env.QueryLimit) : 10,
    cronTime: process.env.cronTime ?? '0 0 0 * * *',
    timeZone: process.env.timeZone ?? 'Asia/Shanghai',
    enableCron: process.env.enableCron ?? 'yes',
    dataKeepDays: process.env.dataKeepDays ? parseInt(process.env.dataKeepDays) : 3,
    LoginUser: process.env.LoginUser ?? 'siphub',
    LoginPasswd: process.env.LoginPasswd ?? '123456@Aa',
    AuthSecret: process.env.AuthSecret,
    AuthSessionSeconds: process.env.AuthSessionSeconds ? parseInt(process.env.AuthSessionSeconds) : 2 * 60 * 60,
    AuthRememberSeconds: process.env.AuthRememberSeconds ? parseInt(process.env.AuthRememberSeconds) : 7 * 24 * 60 * 60,
    Port: process.env.Port ? parseInt(process.env.Port) : 3000
}
