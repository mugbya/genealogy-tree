// 授权服务器地址（代码层面配置）
pub const LICENSE_SERVER_URL: &str = "http://localhost:8080";

// 客户端上报地址
pub const USAGE_REPORT_URL: &str = "http://localhost:8080/api/license/report";

pub const LICENSE_PUBLIC_KEY_PEM: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzuxBcWlR04TvOWBpEuoC
rEDQhYiIgOSHPm/GkpPDwoSFU1Kk/ZMPVGAipd4HUfcOS+2Tz221mzfNsWu3vtyl
Vk+iumRcrsaG24a9ALM5cscYLT7Pk6P1Nnaw5FFWtkD/7+myinz49Tt4RAPQFTjr
GJyN2FCxBCclxMd6MZt9fiQH+WZTCMrsXUGp8dce4qAFjwgbW/lLqKoe8uFOHa7I
TbMxuJT5N4QAhH7Iqnokzsextq2Bu8anfODO4kTwTMKXUoHUc7F//nc4OZ6YK4gw
c4+2Mbu9wJax0lMAI4a0FNGlw6wwOHDaOwxL380ZZXB4yhAVVTtzBQ0owWHsJILJ
BQIDAQAB
-----END PUBLIC KEY-----"#;