import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, "../src-tauri/.genealogy.db");

function now() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

const configs = [
  { key: "allow_create_family", value: "false" },
  { key: "allow_public_access", value: "false" },
  { key: "family_name", value: "陈氏家族（五代演示数据）" },
];

const tags = [
  { name: "原配", tag_type: "spouse", color: "#8B5CF6" },
  { name: "再婚", tag_type: "spouse", color: "#A855F7" },
  { name: "续弦", tag_type: "spouse", color: "#C084FC" },
  { name: "亲生", tag_type: "parent_child", color: "#2563EB" },
  { name: "收养", tag_type: "parent_child", color: "#0EA5E9" },
  { name: "嫡出", tag_type: "parent_child", color: "#1D4ED8" },
  { name: "长子", tag_type: "sibling", color: "#14B8A6" },
  { name: "次子", tag_type: "sibling", color: "#06B6D4" },
  { name: "三子", tag_type: "sibling", color: "#0891B2" },
  { name: "长女", tag_type: "sibling", color: "#EC4899" },
  { name: "次女", tag_type: "sibling", color: "#F472B6" },
  { name: "幺女", tag_type: "sibling", color: "#FB7185" },
  { name: "抗日老兵", tag_type: "special", color: "#F59E0B" },
  { name: "乡贤", tag_type: "special", color: "#F97316" },
  { name: "教师世家", tag_type: "special", color: "#EF4444" },
  { name: "家族理事", tag_type: "special", color: "#DC2626" },
];

const members = [
  {
    key: "chen_wende",
    name: "陈文德",
    gender: "male",
    generation: 1,
    birth_date: "1912-02-18",
    death_date: "1988-10-03",
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "私塾先生",
    photo_path: null,
    biography:
      "陈氏家族近代谱系的重要奠基者，早年任私塾先生，重视家风、礼序与教育，晚年主持修订家族旧谱。",
  },
  {
    key: "huang_shulan",
    name: "黄淑兰",
    gender: "female",
    generation: 1,
    birth_date: "1915-06-09",
    death_date: "1996-01-21",
    birth_place: "福建省泉州市南安县诗山镇",
    occupation: "家庭主妇",
    photo_path: null,
    biography: "陈文德原配，勤俭持家，抚育子女成才，是家族口述记忆中极具威望的长辈。",
  },
  {
    key: "su_yueqin",
    name: "苏月琴",
    gender: "female",
    generation: 1,
    birth_date: "1922-11-14",
    death_date: "2004-04-12",
    birth_place: "福建省泉州市安溪县",
    occupation: "织布匠",
    photo_path: null,
    biography: "陈文德续弦，性情温和，善于调和家中事务，晚年协助整理祖屋与祭祀用品。",
  },

  {
    key: "chen_shoude",
    name: "陈守德",
    gender: "male",
    generation: 2,
    birth_date: "1936-03-18",
    death_date: "2014-11-02",
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "乡村教师",
    photo_path: null,
    biography: "陈文德长子，长期任教乡里，主持整理家族口述史，是第二代核心人物。",
  },
  {
    key: "lin_xiuying",
    name: "林秀英",
    gender: "female",
    generation: 2,
    birth_date: "1938-07-09",
    death_date: "2018-02-14",
    birth_place: "福建省泉州市南安县诗山镇",
    occupation: "家庭主妇",
    photo_path: null,
    biography: "陈守德之妻，擅长操持家务与节庆礼仪，长期照料家中长幼。",
  },
  {
    key: "chen_shouren",
    name: "陈守仁",
    gender: "male",
    generation: 2,
    birth_date: "1940-09-27",
    death_date: "2010-05-16",
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "木匠",
    photo_path: null,
    biography: "陈文德次子，手艺精湛，曾参与修缮祖屋与祠堂木构件。",
  },
  {
    key: "wu_cuilan",
    name: "吴翠兰",
    gender: "female",
    generation: 2,
    birth_date: "1943-01-05",
    death_date: null,
    birth_place: "福建省泉州市惠安县",
    occupation: "裁缝",
    photo_path: null,
    biography: "陈守仁之妻，擅长针线与家用布艺，深受晚辈敬重。",
  },
  {
    key: "chen_shouyi",
    name: "陈守义",
    gender: "male",
    generation: 2,
    birth_date: "1946-12-22",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "退伍军人",
    photo_path: null,
    biography: "陈文德三子，青年时期参军，退伍后返乡参与乡镇建设，家族中以刚正著称。",
  },
  {
    key: "zheng_lanfen",
    name: "郑兰芬",
    gender: "female",
    generation: 2,
    birth_date: "1948-04-11",
    death_date: null,
    birth_place: "福建省泉州市晋江市",
    occupation: "供销社职员",
    photo_path: null,
    biography: "陈守义之妻，做事细致，长期负责家族聚会的物资筹备。",
  },
  {
    key: "chen_shouzhen",
    name: "陈守珍",
    gender: "female",
    generation: 2,
    birth_date: "1950-08-16",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "小学教师",
    photo_path: null,
    biography: "陈文德长女，任教多年，热心家族后辈教育与奖学事务。",
  },
  {
    key: "zhao_jianming",
    name: "赵建明",
    gender: "male",
    generation: 2,
    birth_date: "1949-04-27",
    death_date: null,
    birth_place: "福建省泉州市惠安县",
    occupation: "建筑工程师",
    photo_path: null,
    biography: "陈守珍之夫，长期从事建筑工程管理，参与祖屋修缮与祠堂维护。",
  },

  {
    key: "chen_guoliang",
    name: "陈国良",
    gender: "male",
    generation: 3,
    birth_date: "1958-01-12",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "中学语文教师",
    photo_path: null,
    biography: "陈守德长子，长期从事教育工作，负责整理家族成员资料并维护族谱更新。",
  },
  {
    key: "wang_meihua",
    name: "王美华",
    gender: "female",
    generation: 3,
    birth_date: "1960-09-21",
    death_date: null,
    birth_place: "福建省泉州市晋江市",
    occupation: "会计",
    photo_path: null,
    biography: "陈国良之妻，擅长财务管理，负责家族聚会经费与资料归档。",
  },
  {
    key: "chen_guoqiang",
    name: "陈国强",
    gender: "male",
    generation: 3,
    birth_date: "1962-05-03",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "退伍军人",
    photo_path: null,
    biography: "陈守德次子，青年时期参军，退伍后返乡创业，热心家族公益事务。",
  },
  {
    key: "li_fang",
    name: "李芳",
    gender: "female",
    generation: 3,
    birth_date: "1964-12-11",
    death_date: null,
    birth_place: "福建省泉州市安溪县",
    occupation: "乡镇卫生院护士",
    photo_path: null,
    biography: "陈国强之妻，长期在基层医疗岗位工作，深受乡邻信任。",
  },
  {
    key: "chen_guizhen",
    name: "陈桂珍",
    gender: "female",
    generation: 3,
    birth_date: "1966-08-16",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "小学教师",
    photo_path: null,
    biography: "陈守德长女，任教多年，热心家族后辈教育与奖学事务。",
  },
  {
    key: "liu_qingshan",
    name: "刘青山",
    gender: "male",
    generation: 3,
    birth_date: "1965-03-08",
    death_date: null,
    birth_place: "福建省福州市闽侯县",
    occupation: "粮站干部",
    photo_path: null,
    biography: "陈桂珍之夫，做事稳重，常协助家族长辈处理对外联络事务。",
  },
  {
    key: "chen_guowei",
    name: "陈国伟",
    gender: "male",
    generation: 3,
    birth_date: "1968-07-19",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "家具厂经营者",
    photo_path: null,
    biography: "陈守仁长子，经营家具厂多年，擅长组织家族大型聚会。",
  },
  {
    key: "he_xiaoqin",
    name: "何小琴",
    gender: "female",
    generation: 3,
    birth_date: "1970-10-02",
    death_date: null,
    birth_place: "福建省泉州市德化县",
    occupation: "陶瓷设计师",
    photo_path: null,
    biography: "陈国伟之妻，从事陶瓷设计，审美出众，参与家族纪念品设计。",
  },
  {
    key: "chen_guomei",
    name: "陈国梅",
    gender: "female",
    generation: 3,
    birth_date: "1972-02-26",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "医院药剂师",
    photo_path: null,
    biography: "陈守仁次女，工作认真，常为家族长辈提供健康建议。",
  },
  {
    key: "sun_weidong",
    name: "孙卫东",
    gender: "male",
    generation: 3,
    birth_date: "1971-11-17",
    death_date: null,
    birth_place: "福建省厦门市同安区",
    occupation: "港口调度员",
    photo_path: null,
    biography: "陈国梅之夫，长期在港口系统工作，性格爽朗，善于协调事务。",
  },
  {
    key: "chen_guoan",
    name: "陈国安",
    gender: "male",
    generation: 3,
    birth_date: "1974-06-14",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "乡镇干部",
    photo_path: null,
    biography: "陈守义长子，长期在基层任职，负责家族公共事务与祭祖安排。",
  },
  {
    key: "zhou_lan",
    name: "周岚",
    gender: "female",
    generation: 3,
    birth_date: "1976-03-19",
    death_date: null,
    birth_place: "福建省漳州市龙海区",
    occupation: "银行职员",
    photo_path: null,
    biography: "陈国安之妻，工作细致，常协助整理家族成员联系方式与礼金记录。",
  },
  {
    key: "chen_guohua",
    name: "陈国华",
    gender: "male",
    generation: 3,
    birth_date: "1978-09-08",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "水电工程承包商",
    photo_path: null,
    biography: "陈守义次子，常年在外承接工程，逢年过节必返乡参与家族事务。",
  },
  {
    key: "lin_peizhen",
    name: "林佩珍",
    gender: "female",
    generation: 3,
    birth_date: "1980-01-29",
    death_date: null,
    birth_place: "福建省泉州市石狮市",
    occupation: "服装店主",
    photo_path: null,
    biography: "陈国华之妻，经营服装店，待人热情，家族聚会中常负责接待。",
  },
  {
    key: "chen_guoyu",
    name: "陈国玉",
    gender: "female",
    generation: 3,
    birth_date: "1981-12-03",
    death_date: null,
    birth_place: "福建省泉州市南安县梅山镇",
    occupation: "图书管理员",
    photo_path: null,
    biography: "陈守珍之女，喜爱文史资料，协助整理家族旧照片与文献。",
  },
  {
    key: "xu_jian",
    name: "许健",
    gender: "male",
    generation: 3,
    birth_date: "1980-05-12",
    death_date: null,
    birth_place: "福建省厦门市集美区",
    occupation: "出版社编辑",
    photo_path: null,
    biography: "陈国玉之夫，从事出版工作，帮助家族整理纪念册与文字材料。",
  },

  {
    key: "chen_jianhua",
    name: "陈建华",
    gender: "male",
    generation: 4,
    birth_date: "1985-02-14",
    death_date: null,
    birth_place: "福建省泉州市",
    occupation: "软件工程师",
    photo_path: null,
    biography: "陈国良长子，现居厦门，从事软件开发，是家族数字化族谱项目的主要推动者。",
  },
  {
    key: "xu_ning",
    name: "许宁",
    gender: "female",
    generation: 4,
    birth_date: "1987-06-30",
    death_date: null,
    birth_place: "福建省厦门市",
    occupation: "产品经理",
    photo_path: null,
    biography: "陈建华之妻，擅长产品规划，协助设计家族信息录入流程。",
  },
  {
    key: "chen_jianmin",
    name: "陈建民",
    gender: "male",
    generation: 4,
    birth_date: "1988-10-08",
    death_date: null,
    birth_place: "福建省泉州市",
    occupation: "公务员",
    photo_path: null,
    biography: "陈国强长子，现任基层公务员，负责协调家族公共事务与活动通知。",
  },
  {
    key: "zhang_yue",
    name: "张悦",
    gender: "female",
    generation: 4,
    birth_date: "1990-03-19",
    death_date: null,
    birth_place: "福建省漳州市",
    occupation: "银行职员",
    photo_path: null,
    biography: "陈建民之妻，工作细致，常协助整理家族成员联系方式。",
  },
  {
    key: "chen_xiaoyan",
    name: "陈晓燕",
    gender: "female",
    generation: 4,
    birth_date: "1992-11-05",
    death_date: null,
    birth_place: "福建省泉州市",
    occupation: "中学英语教师",
    photo_path: null,
    biography: "陈桂珍之女，热心公益，常组织家族后辈寒暑假读书活动。",
  },
  {
    key: "liu_bo",
    name: "刘博",
    gender: "male",
    generation: 4,
    birth_date: "1991-09-13",
    death_date: null,
    birth_place: "福建省福州市",
    occupation: "外贸经理",
    photo_path: null,
    biography: "陈晓燕之夫，从事外贸行业，常年往返沿海城市，支持家族文化活动。",
  },
  {
    key: "chen_jianyu",
    name: "陈建宇",
    gender: "male",
    generation: 4,
    birth_date: "1993-04-22",
    death_date: null,
    birth_place: "福建省泉州市",
    occupation: "建筑设计师",
    photo_path: null,
    biography: "陈国伟长子，擅长建筑与空间设计，参与祖屋修缮方案绘制。",
  },
  {
    key: "gao_xin",
    name: "高欣",
    gender: "female",
    generation: 4,
    birth_date: "1994-08-09",
    death_date: null,
    birth_place: "福建省厦门市",
    occupation: "室内设计师",
    photo_path: null,
    biography: "陈建宇之妻，审美细腻，常协助家族活动场地布置。",
  },
  {
    key: "chen_jiali",
    name: "陈佳丽",
    gender: "female",
    generation: 4,
    birth_date: "1995-01-17",
    death_date: null,
    birth_place: "福建省泉州市",
    occupation: "儿科医生",
    photo_path: null,
    biography: "陈国梅之女，现任儿科医生，家族中常为晚辈提供健康建议。",
  },
  {
    key: "wu_haonan",
    name: "吴浩楠",
    gender: "male",
    generation: 4,
    birth_date: "1993-12-28",
    death_date: null,
    birth_place: "福建省厦门市",
    occupation: "医疗器械销售",
    photo_path: null,
    biography: "陈佳丽之夫，长期从事医疗器械行业，支持家族健康公益活动。",
  },
  {
    key: "chen_haoran",
    name: "陈浩然",
    gender: "male",
    generation: 4,
    birth_date: "1998-07-07",
    death_date: null,
    birth_place: "福建省泉州市",
    occupation: "短视频编导",
    photo_path: null,
    biography: "陈国安次子，擅长影像记录，负责拍摄家族聚会与祭祖影像资料。",
  },
  {
    key: "lin_yutong",
    name: "林雨桐",
    gender: "female",
    generation: 4,
    birth_date: "1999-10-18",
    death_date: null,
    birth_place: "福建省泉州市石狮市",
    occupation: "新媒体运营",
    photo_path: null,
    biography: "陈浩然之妻，擅长内容传播，协助家族活动宣传与照片整理。",
  },
  {
    key: "chen_xinyi",
    name: "陈欣怡",
    gender: "female",
    generation: 4,
    birth_date: "2000-05-28",
    death_date: null,
    birth_place: "福建省泉州市",
    occupation: "研究生",
    photo_path: null,
    biography: "陈国玉之女，主修历史文献学，对家族谱牒与地方志研究兴趣浓厚。",
  },

  {
    key: "chen_yuze",
    name: "陈宇泽",
    gender: "male",
    generation: 5,
    birth_date: "2013-04-22",
    death_date: null,
    birth_place: "福建省厦门市",
    occupation: "学生",
    photo_path: null,
    biography: "陈建华之子，第五代长孙，活泼好学，对家族故事很感兴趣。",
  },
  {
    key: "chen_yutong",
    name: "陈雨桐",
    gender: "female",
    generation: 5,
    birth_date: "2016-08-09",
    death_date: null,
    birth_place: "福建省厦门市",
    occupation: "学生",
    photo_path: null,
    biography: "陈建华之女，喜欢绘画，经常在家族聚会中为长辈画像。",
  },
  {
    key: "chen_zixuan",
    name: "陈梓轩",
    gender: "male",
    generation: 5,
    birth_date: "2019-01-17",
    death_date: null,
    birth_place: "福建省泉州市",
    occupation: "幼儿",
    photo_path: null,
    biography: "陈建民之子，性格开朗，是家中备受宠爱的晚辈。",
  },
  {
    key: "liu_xinyi",
    name: "刘欣怡",
    gender: "female",
    generation: 5,
    birth_date: "2020-05-28",
    death_date: null,
    birth_place: "福建省福州市",
    occupation: "幼儿",
    photo_path: null,
    biography: "陈晓燕之女，家族第五代成员中年龄较小的一位。",
  },
  {
    key: "chen_muchen",
    name: "陈沐宸",
    gender: "male",
    generation: 5,
    birth_date: "2021-09-03",
    death_date: null,
    birth_place: "福建省厦门市",
    occupation: "幼儿",
    photo_path: null,
    biography: "陈建宇之子，出生后成为祖辈们关注的焦点，常出现在家族合影中。",
  },
  {
    key: "wu_xiaonuo",
    name: "吴晓诺",
    gender: "female",
    generation: 5,
    birth_date: "2022-12-11",
    death_date: null,
    birth_place: "福建省厦门市",
    occupation: "幼儿",
    photo_path: null,
    biography: "陈佳丽之女，家族中最年幼的一批成员之一，深受长辈喜爱。",
  },
];

const relations = [
  ["chen_wende", "huang_shulan", "spouse", "原配"],
  ["huang_shulan", "chen_wende", "spouse", "原配"],
  ["chen_wende", "su_yueqin", "spouse", "续弦"],
  ["su_yueqin", "chen_wende", "spouse", "续弦"],

  ["chen_shoude", "lin_xiuying", "spouse", "原配"],
  ["lin_xiuying", "chen_shoude", "spouse", "原配"],
  ["chen_shouren", "wu_cuilan", "spouse", "原配"],
  ["wu_cuilan", "chen_shouren", "spouse", "原配"],
  ["chen_shouyi", "zheng_lanfen", "spouse", "原配"],
  ["zheng_lanfen", "chen_shouyi", "spouse", "原配"],
  ["chen_shouzhen", "zhao_jianming", "spouse", "原配"],
  ["zhao_jianming", "chen_shouzhen", "spouse", "原配"],

  ["chen_guoliang", "wang_meihua", "spouse", "原配"],
  ["wang_meihua", "chen_guoliang", "spouse", "原配"],
  ["chen_guoqiang", "li_fang", "spouse", "原配"],
  ["li_fang", "chen_guoqiang", "spouse", "原配"],
  ["chen_guizhen", "liu_qingshan", "spouse", "原配"],
  ["liu_qingshan", "chen_guizhen", "spouse", "原配"],
  ["chen_guowei", "he_xiaoqin", "spouse", "原配"],
  ["he_xiaoqin", "chen_guowei", "spouse", "原配"],
  ["chen_guomei", "sun_weidong", "spouse", "原配"],
  ["sun_weidong", "chen_guomei", "spouse", "原配"],
  ["chen_guoan", "zhou_lan", "spouse", "原配"],
  ["zhou_lan", "chen_guoan", "spouse", "原配"],
  ["chen_guohua", "lin_peizhen", "spouse", "原配"],
  ["lin_peizhen", "chen_guohua", "spouse", "原配"],
  ["chen_guoyu", "xu_jian", "spouse", "原配"],
  ["xu_jian", "chen_guoyu", "spouse", "原配"],

  ["chen_jianhua", "xu_ning", "spouse", "原配"],
  ["xu_ning", "chen_jianhua", "spouse", "原配"],
  ["chen_jianmin", "zhang_yue", "spouse", "原配"],
  ["zhang_yue", "chen_jianmin", "spouse", "原配"],
  ["chen_xiaoyan", "liu_bo", "spouse", "原配"],
  ["liu_bo", "chen_xiaoyan", "spouse", "原配"],
  ["chen_jianyu", "gao_xin", "spouse", "原配"],
  ["gao_xin", "chen_jianyu", "spouse", "原配"],
  ["chen_jiali", "wu_haonan", "spouse", "原配"],
  ["wu_haonan", "chen_jiali", "spouse", "原配"],
  ["chen_haoran", "lin_yutong", "spouse", "原配"],
  ["lin_yutong", "chen_haoran", "spouse", "原配"],

  ["chen_wende", "chen_shoude", "father", "亲生"],
  ["huang_shulan", "chen_shoude", "mother", "嫡出"],
  ["chen_wende", "chen_shouren", "father", "亲生"],
  ["huang_shulan", "chen_shouren", "mother", "嫡出"],
  ["chen_wende", "chen_shouyi", "father", "亲生"],
  ["su_yueqin", "chen_shouyi", "mother", "亲生"],
  ["chen_wende", "chen_shouzhen", "father", "亲生"],
  ["su_yueqin", "chen_shouzhen", "mother", "亲生"],

  ["chen_shoude", "chen_guoliang", "father", "亲生"],
  ["lin_xiuying", "chen_guoliang", "mother", "亲生"],
  ["chen_shoude", "chen_guoqiang", "father", "亲生"],
  ["lin_xiuying", "chen_guoqiang", "mother", "亲生"],
  ["chen_shoude", "chen_guizhen", "father", "亲生"],
  ["lin_xiuying", "chen_guizhen", "mother", "亲生"],

  ["chen_shouren", "chen_guowei", "father", "亲生"],
  ["wu_cuilan", "chen_guowei", "mother", "亲生"],
  ["chen_shouren", "chen_guomei", "father", "亲生"],
  ["wu_cuilan", "chen_guomei", "mother", "亲生"],

  ["chen_shouyi", "chen_guoan", "father", "亲生"],
  ["zheng_lanfen", "chen_guoan", "mother", "亲生"],
  ["chen_shouyi", "chen_guohua", "father", "亲生"],
  ["zheng_lanfen", "chen_guohua", "mother", "亲生"],

  ["zhao_jianming", "chen_guoyu", "father", "亲生"],
  ["chen_shouzhen", "chen_guoyu", "mother", "亲生"],

  ["chen_guoliang", "chen_jianhua", "father", "亲生"],
  ["wang_meihua", "chen_jianhua", "mother", "亲生"],
  ["chen_guoqiang", "chen_jianmin", "father", "亲生"],
  ["li_fang", "chen_jianmin", "mother", "亲生"],
  ["liu_qingshan", "chen_xiaoyan", "father", "亲生"],
  ["chen_guizhen", "chen_xiaoyan", "mother", "亲生"],
  ["chen_guowei", "chen_jianyu", "father", "亲生"],
  ["he_xiaoqin", "chen_jianyu", "mother", "亲生"],
  ["sun_weidong", "chen_jiali", "father", "亲生"],
  ["chen_guomei", "chen_jiali", "mother", "亲生"],
  ["chen_guoan", "chen_haoran", "father", "亲生"],
  ["zhou_lan", "chen_haoran", "mother", "亲生"],
  ["xu_jian", "chen_xinyi", "father", "亲生"],
  ["chen_guoyu", "chen_xinyi", "mother", "亲生"],

  ["chen_jianhua", "chen_yuze", "father", "亲生"],
  ["xu_ning", "chen_yuze", "mother", "亲生"],
  ["chen_jianhua", "chen_yutong", "father", "亲生"],
  ["xu_ning", "chen_yutong", "mother", "亲生"],
  ["chen_jianmin", "chen_zixuan", "father", "亲生"],
  ["zhang_yue", "chen_zixuan", "mother", "亲生"],
  ["liu_bo", "liu_xinyi", "father", "亲生"],
  ["chen_xiaoyan", "liu_xinyi", "mother", "亲生"],
  ["chen_jianyu", "chen_muchen", "father", "亲生"],
  ["gao_xin", "chen_muchen", "mother", "亲生"],
  ["wu_haonan", "wu_xiaonuo", "father", "亲生"],
  ["chen_jiali", "wu_xiaonuo", "mother", "亲生"],

  ["chen_shoude", "chen_shouren", "older_brother", "长子"],
  ["chen_shouren", "chen_shoude", "younger_brother", "次子"],
  ["chen_shouren", "chen_shouyi", "older_brother", "次子"],
  ["chen_shouyi", "chen_shouren", "younger_brother", "三子"],
  ["chen_shouyi", "chen_shouzhen", "older_brother", "长女"],
  ["chen_shouzhen", "chen_shouyi", "younger_sister", "长女"],

  ["chen_guoliang", "chen_guoqiang", "older_brother", "长子"],
  ["chen_guoqiang", "chen_guoliang", "younger_brother", "次子"],
  ["chen_guoqiang", "chen_guizhen", "older_brother", "长女"],
  ["chen_guizhen", "chen_guoqiang", "younger_sister", "长女"],

  ["chen_guowei", "chen_guomei", "older_brother", "长女"],
  ["chen_guomei", "chen_guowei", "younger_sister", "次女"],

  ["chen_guoan", "chen_guohua", "older_brother", "长子"],
  ["chen_guohua", "chen_guoan", "younger_brother", "次子"],

  ["chen_jianhua", "chen_jianmin", "older_brother", "长子"],
  ["chen_jianmin", "chen_jianhua", "younger_brother", "次子"],
  ["chen_jianmin", "chen_xiaoyan", "older_brother", "长女"],
  ["chen_xiaoyan", "chen_jianmin", "younger_sister", "长女"],

  ["chen_jianyu", "chen_jiali", "older_brother", "长女"],
  ["chen_jiali", "chen_jianyu", "younger_sister", "次女"],

  ["chen_yuze", "chen_yutong", "older_brother", "长子"],
  ["chen_yutong", "chen_yuze", "younger_sister", "幺女"],
];

const users = [
  {
    username: "admin",
    password: "Admin123456",
    role: "admin",
    memberKey: "chen_jianhua",
  },
  {
    username: "guoan",
    password: "Guoan123",
    role: "user",
    memberKey: "chen_guoan",
  },
  {
    username: "xiaoyan",
    password: "Xiaoyan123",
    role: "user",
    memberKey: "chen_xiaoyan",
  },
  {
    username: "jianyu",
    password: "Jianyu123",
    role: "user",
    memberKey: "chen_jianyu",
  },
  {
    username: "xinyi",
    password: "Xinyi123",
    role: "user",
    memberKey: "chen_xinyi",
  },
];

const db = new DatabaseSync(dbPath);

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'male',
      generation INTEGER,
      birth_date TEXT,
      death_date TEXT,
      birth_place TEXT,
      occupation TEXT,
      photo_path TEXT,
      biography TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS relation_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      tag_type TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#000000',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS member_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_member_id INTEGER NOT NULL,
      to_member_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL,
      tag_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (from_member_id) REFERENCES family_members(id) ON DELETE CASCADE,
      FOREIGN KEY (to_member_id) REFERENCES family_members(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES relation_tags(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS family_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      member_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES family_members(id)
    );
  `);
}

function clearTables() {
  db.exec("PRAGMA foreign_keys = OFF");

  db.prepare("DELETE FROM users").run();
  db.prepare("DELETE FROM member_relations").run();
  db.prepare("DELETE FROM relation_tags").run();
  db.prepare("DELETE FROM family_members").run();
  db.prepare("DELETE FROM family_config").run();
  db.prepare(
    "DELETE FROM sqlite_sequence WHERE name IN ('users', 'member_relations', 'relation_tags', 'family_members', 'family_config')",
  ).run();

  db.exec("PRAGMA foreign_keys = ON");
}

function insertConfigs() {
  const stmt = db.prepare(`
    INSERT INTO family_config (key, value, updated_at)
    VALUES (?, ?, ?)
  `);

  for (const item of configs) {
    stmt.run(item.key, item.value, now());
  }
}

function insertTags() {
  const stmt = db.prepare(`
    INSERT INTO relation_tags (name, tag_type, color, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const tagIdMap = new Map();

  for (const item of tags) {
    const result = stmt.run(item.name, item.tag_type, item.color, now());
    tagIdMap.set(item.name, Number(result.lastInsertRowid));
  }

  return tagIdMap;
}

function insertMembers() {
  const stmt = db.prepare(`
    INSERT INTO family_members (
      name,
      gender,
      generation,
      birth_date,
      death_date,
      birth_place,
      occupation,
      photo_path,
      biography,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const memberIdMap = new Map();

  for (const item of members) {
    const timestamp = now();
    const result = stmt.run(
      item.name,
      item.gender,
      item.generation,
      item.birth_date,
      item.death_date,
      item.birth_place,
      item.occupation,
      item.photo_path,
      item.biography,
      timestamp,
      timestamp,
    );

    memberIdMap.set(item.key, Number(result.lastInsertRowid));
  }

  return memberIdMap;
}

function insertRelations(memberIdMap, tagIdMap) {
  const stmt = db.prepare(`
    INSERT INTO member_relations (
      from_member_id,
      to_member_id,
      relation_type,
      tag_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `);

  for (const [fromKey, toKey, relationType, tagName] of relations) {
    const fromId = memberIdMap.get(fromKey);
    const toId = memberIdMap.get(toKey);
    const tagId = tagName ? (tagIdMap.get(tagName) ?? null) : null;

    if (!fromId || !toId) {
      throw new Error(`Missing member id for relation: ${fromKey} -> ${toKey}`);
    }

    stmt.run(fromId, toId, relationType, tagId, now());
  }
}

function insertUsers(memberIdMap) {
  const stmt = db.prepare(`
    INSERT INTO users (
      username,
      password_hash,
      role,
      member_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const item of users) {
    const memberId = memberIdMap.get(item.memberKey) ?? null;
    const timestamp = now();

    stmt.run(item.username, hashPassword(item.password), item.role, memberId, timestamp, timestamp);
  }
}

function countRows(tableName) {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  return Number(row.count);
}

function printSummary() {
  console.log("Seed completed successfully.");
  console.log(`Database: ${dbPath}`);
  console.log(`Configs: ${countRows("family_config")}`);
  console.log(`Tags: ${countRows("relation_tags")}`);
  console.log(`Members: ${countRows("family_members")}`);
  console.log(`Relations: ${countRows("member_relations")}`);
  console.log(`Users: ${countRows("users")}`);
  console.log("");
  console.log("Demo accounts (data only, not backend-login compatible by default):");
  for (const item of users) {
    console.log(`- ${item.username} / ${item.password} (${item.role})`);
  }
}

function main() {
  ensureSchema();

  try {
    db.exec("BEGIN");
    clearTables();
    insertConfigs();
    const tagIdMap = insertTags();
    const memberIdMap = insertMembers();
    insertRelations(memberIdMap, tagIdMap);
    insertUsers(memberIdMap);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  }

  printSummary();
  db.close();
}

main();
