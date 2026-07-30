    // ============ FRAGMENT BOOTSTRAP (early start) ============
    // 拆分后的 page/modal 片段通过 fetch 注入，保留 SPA 体验与共享 JS 上下文
    const FRAGMENT_CACHE = {};
    const CACHE_BUSTER = Date.now();
    async function loadFragment(url) {
      const cacheKey = url;
      if (FRAGMENT_CACHE[cacheKey]) return FRAGMENT_CACHE[cacheKey];
      const res = await fetch(url + '?_=' + CACHE_BUSTER);
      if (!res.ok) throw new Error('Failed to load ' + url + ': ' + res.status);
      const html = await res.text();
      FRAGMENT_CACHE[cacheKey] = html;
      return html;
    }
    const FRAGMENT_PAGES = ['dashboard','planning','resume','diagnosis','tasks','assessment','interview','profile','market'];
    const FRAGMENT_MODALS = ['submit','assessment','ai-interview','result','profile-report','toast','task-detail','notifications','help','confirm','filter'];
    window.__fragmentsReady = (async () => {
      try {
        const [pageHtmls, modalHtmls] = await Promise.all([
          Promise.all(FRAGMENT_PAGES.map(p => loadFragment(`pages/page-${p}.html`))),
          Promise.all(FRAGMENT_MODALS.map(m => loadFragment(`modals/modal-${m}.html`)))
        ]);
        document.getElementById('pages-host').innerHTML = pageHtmls.join('\n');
        document.getElementById('modals-host').innerHTML = modalHtmls.join('\n');
      } catch (e) {
        console.error('[Fragment Loader] Failed:', e);
      }
    })();

    // ============ STATE ============
    // 全局状态持久化（P0：刷新不丢进度）
    const STATE_STORAGE_KEY = 'career_state_v1';
    const ACCOUNT_STORAGE_PREFIX = 'career_account_';
    
    // 获取账号的独立存储键
    function getAccountStorageKey(email) {
      return ACCOUNT_STORAGE_PREFIX + (email || 'default');
    }
    
    // 保存当前账号的独立数据
    function saveAccountData() {
      if (!currentAccount || !currentAccount.email) return;
      try {
        const snapshot = {
          id: currentAccount.id,
          name: currentAccount.name,
          avatar: currentAccount.avatar,
          major: currentAccount.major,
          grade: currentAccount.grade,
          target: currentAccount.target,
          email: currentAccount.email,
          school: currentAccount.school,
          bio: currentAccount.bio,
          greeting: currentAccount.greeting,
          matchPercent: currentAccount.matchPercent,
          gapPercent: currentAccount.gapPercent,
          tasksPending: currentAccount.tasksPending,
          tasksDone: currentAccount.tasksDone,
          studyHours: currentAccount.studyHours,
          jobTags: currentAccount.jobTags,
          jobColor: currentAccount.jobColor,
          isNewUser: currentAccount.isNewUser,
          registrationDate: currentAccount.registrationDate,
          learningDays: currentAccount.learningDays,
        };
        localStorage.setItem(getAccountStorageKey(currentAccount.email), JSON.stringify(snapshot));
      } catch (e) {
        console.warn('[saveAccountData] 持久化失败:', e);
      }
    }
    
    // 加载指定账号的独立数据
    function loadAccountData(email) {
      try {
        const raw = localStorage.getItem(getAccountStorageKey(email));
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        if (!snapshot || typeof snapshot !== 'object') return null;
        return snapshot;
      } catch (e) {
        console.warn('[loadAccountData] 读取失败:', e);
        return null;
      }
    }
    
    function saveState() {
      try {
        // 只持久化可序列化的业务字段，避免存函数/环形引用
        const snapshot = {
          id: currentAccount.id,
          name: currentAccount.name,
          avatar: currentAccount.avatar,
          major: currentAccount.major,
          grade: currentAccount.grade,
          target: currentAccount.target,
          email: currentAccount.email,
          school: currentAccount.school,
          bio: currentAccount.bio,
          greeting: currentAccount.greeting,
          matchPercent: currentAccount.matchPercent,
          gapPercent: currentAccount.gapPercent,
          tasksPending: currentAccount.tasksPending,
          tasksDone: currentAccount.tasksDone,
          studyHours: currentAccount.studyHours,
          jobTags: currentAccount.jobTags,
          jobColor: currentAccount.jobColor,
          isNewUser: currentAccount.isNewUser,
          registrationDate: currentAccount.registrationDate,
          learningDays: currentAccount.learningDays,
        };
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(snapshot));
        // 同时保存到账号独立存储
        saveAccountData();
      } catch (e) {
        console.warn('[saveState] 持久化失败:', e);
      }
    }
    function loadState() {
      try {
        const raw = localStorage.getItem(STATE_STORAGE_KEY);
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        if (!snapshot || typeof snapshot !== 'object') return null;
        return snapshot;
      } catch (e) {
        console.warn('[loadState] 读取失败:', e);
        return null;
      }
    }
    function applySavedStateToAccount(saved) {
      if (!saved || !currentAccount) return;
      // 只覆盖存在的字段，避免污染原结构
      Object.keys(saved).forEach(k => {
        if (saved[k] !== undefined && saved[k] !== null) {
          currentAccount[k] = saved[k];
        }
      });
    }
    const PAGE_LABELS = {
      dashboard: '工作台',
      planning: '职业规划',
      resume: '理想简历',
      diagnosis: '技能诊断',
      assessment: '职业测评',
      tasks: '任务中心',
      profile: '个人中心',
      interview: 'AI 模拟面试',
      market: '岗位市场',
    };
    const charts = {};
    let chartsInit = { dashboard: false, diagnosisRadar: false, market: false };

    // ============ BUTTON LOADING 工具函数 ============
    // 用法：onclick="withLoading(this, () => startResumeDiagnosis())"
    // 点击后按钮禁用、文字改为"AI 分析中…"，asyncFn 完成后自动恢复
    function withLoading(btn, asyncFn, loadingText) {
      if (!btn) return Promise.resolve(asyncFn());
      const origHtml = btn.innerHTML;
      const origDisabled = btn.disabled;
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.style.cursor = 'not-allowed';
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>' + (loadingText || 'AI 分析中…');
      return Promise.resolve(asyncFn()).finally(() => {
        btn.innerHTML = origHtml;
        btn.disabled = origDisabled;
        btn.style.opacity = '';
        btn.style.cursor = '';
      });
    }

    // ============ ASSESSMENT DATA & STATE ============
    const ASSESSMENT_DATA = {
      mbti: {
        title: 'MBTI 人格测评',
        desc: '探索你的性格类型，了解认知风格',
        color: '#6D5EF6',
        icon: 'fa-user-astronaut',
        questions: [
          { q: '当你参加一个社交聚会时，你会：', a: '主动和很多人交谈，包括陌生人', b: '只和几个熟悉的人交谈' },
          { q: '你更倾向于：', a: '关注现实和具体的事物', b: '关注可能性和整体模式' },
          { q: '做决定时，你更看重：', a: '逻辑和客观分析', b: '价值观和他人感受' },
          { q: '你喜欢的生活方式是：', a: '有计划、有条理的', b: '灵活、随机应变的' },
          { q: '当你需要集中精力时，你会：', a: '喜欢和别人讨论问题', b: '独自思考解决问题' },
          { q: '你更相信：', a: '经验和事实', b: '直觉和灵感' },
          { q: '批评别人时，你通常：', a: '直接坦率，对事不对人', b: '委婉体贴，照顾感受' },
          { q: '面对截止日期，你会：', a: '提前规划，早早完成', b: '最后期限前爆发完成' },
          { q: '周末你更愿意：', a: '约朋友出去玩', b: '在家休息看书看剧' },
          { q: '解决问题时你更擅长：', a: '关注细节和步骤', b: '看到整体和联系' },
        ],
        results: {
          'INTJ': { name: '建筑师', desc: '富有想象力和战略性的思想家', traits: ['独立思考', '战略规划', '追求完美', '高度理性'], jobs: ['产品经理', '架构师', '战略咨询', '数据科学家'] },
          'INTP': { name: '逻辑学家', desc: '具有创造力的发明家，对知识有着止不住的渴望', traits: ['逻辑分析', '理论研究', '独立思考', '好奇心强'], jobs: ['算法工程师', '研究员', '系统架构师', '数据分析师'] },
          'ENTJ': { name: '指挥官', desc: '大胆、富有想象力且意志强大的领导者', traits: ['领导力', '目标导向', '果断决策', '战略思维'], jobs: ['项目经理', '创业创始人', '高管', '投资经理'] },
          'ENTP': { name: '辩论家', desc: '聪明好奇的思想者，不会放弃任何智力上的挑战', traits: ['创新思维', '能言善辩', '快速学习', '挑战权威'], jobs: ['产品经理', '市场营销', '创业', '投资分析师'] },
          'INFJ': { name: '提倡者', desc: '安静而神秘，同时鼓舞人心且不知疲倦的理想主义者', traits: ['深刻洞察', '理想主义', '同理心强', '追求意义'], jobs: ['用户研究员', '心理咨询师', '内容创作者', '产品设计师'] },
          'INFP': { name: '调停者', desc: '诗意、善良的利他主义者，总是热衷于支持正义事业', traits: ['富有同理心', '理想主义', '创造力强', '忠于价值观'], jobs: ['UX设计师', '内容运营', '人力资源', '社工'] },
          'ENFJ': { name: '主人公', desc: '富有魅力且鼓舞人心的领导者，有使听众着迷的能力', traits: ['感染力强', '利他主义', '善于激励', '组织协调'], jobs: ['人力资源经理', '培训师', '市场推广', '团队主管'] },
          'ENFP': { name: '竞选者', desc: '热情、有创造力、社交能力强的人，总能找到理由微笑', traits: ['热情洋溢', '创意丰富', '善于社交', '乐观积极'], jobs: ['市场营销', '公关', '产品运营', '创业者'] },
          'ISTJ': { name: '物流师', desc: '实际且注重事实的个人，可靠性不容怀疑', traits: ['严谨可靠', '注重细节', '遵守规则', '责任心强'], jobs: ['财务会计', '测试工程师', '运维工程师', '行政管理'] },
          'ISFJ': { name: '守卫者', desc: '非常专注而温暖的守护者，时刻准备着保护爱着的人们', traits: ['细心体贴', '忠诚可靠', '乐于助人', '有责任感'], jobs: ['行政助理', '客户服务', '护士', '人力资源'] },
          'ESTJ': { name: '总经理', desc: '出色的管理者，在管理事情或人的方面无与伦比', traits: ['组织能力强', '务实高效', '果断决策', '注重秩序'], jobs: ['项目经理', '运营经理', '销售经理', '公务员'] },
          'ESFJ': { name: '执政官', desc: '极有同情心、爱社交、受欢迎的人，总是热心帮助他人', traits: ['热情友善', '善于合作', '关心他人', '注重和谐'], jobs: ['客户成功', '销售', '行政主管', '教师'] },
          'ISTP': { name: '鉴赏家', desc: '大胆而实际的实验家，擅长使用任何形式的工具', traits: ['动手能力强', '冷静理性', '适应力强', '实用主义'], jobs: ['前端工程师', '硬件工程师', '技术支持', '运维'] },
          'ISFP': { name: '探险家', desc: '灵活、有魅力的艺术家，时刻准备着探索和体验新鲜事物', traits: ['艺术敏感', '温和随和', '脚踏实地', '审美力强'], jobs: ['UI设计师', '视觉设计', '摄影师', '插画师'] },
          'ESTP': { name: '企业家', desc: '聪明、精力充沛、善于感知的人，真心享受生活在边缘', traits: ['行动力强', '反应敏捷', '善于谈判', '享受挑战'], jobs: ['销售', '商务拓展', '创业者', '市场专员'] },
          'ESFP': { name: '表演者', desc: '自发的、精力充沛而热情的表演者，生活在他们身边永不无聊', traits: ['热情外向', '善于表达', '乐观活泼', '人际协调'], jobs: ['市场活动', '公关专员', '主播', '销售'] },
        }
      },
      holland: {
        title: '霍兰德职业兴趣测评',
        desc: 'RIASEC模型，发现你的职业兴趣代码',
        color: '#0EA5B7',
        icon: 'fa-compass',
        questions: [
          { q: '我喜欢动手操作工具、机械，做实际的事情', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我喜欢观察、学习、调查、分析、评估和解决问题', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我喜欢做创意、想象、直觉、自由变化的工作', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我喜欢与人交往、沟通、帮助、教学、服务他人', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我喜欢影响、说服、领导他人，追求成就和地位', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我喜欢有条理、系统性的工作，注重细节和规则', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '修理自行车、电器这类事情我很擅长或很想尝试', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '做实验、搞研究让我觉得很有乐趣', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我经常有独特的创意和想法，喜欢艺术创作', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我喜欢教别人、帮助别人解决问题', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我喜欢领导团队一起完成目标', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
          { q: '我喜欢把文件、资料整理得井井有条', a: '非常符合', b: '比较符合', c: '不确定', d: '不太符合', e: '不符合' },
        ],
        dimensions: { R: '现实型', I: '研究型', A: '艺术型', S: '社会型', E: '企业型', C: '常规型' },
        results: {
          'R': { name: '现实型 (Realistic)', desc: '喜欢动手操作、使用工具机械，偏好具体任务', jobs: ['工程师', '技术员', '机械师', '建筑师', '程序员'] },
          'I': { name: '研究型 (Investigative)', desc: '喜欢观察、思考、分析、解决问题，追求知识和真理', jobs: ['科学家', '研究员', '数据分析师', '医生', '学者'] },
          'A': { name: '艺术型 (Artistic)', desc: '喜欢创意、想象、自由表达，追求美感和独特性', jobs: ['设计师', '艺术家', '作家', '音乐家', '导演'] },
          'S': { name: '社会型 (Social)', desc: '喜欢与人交往、帮助他人、教育服务他人', jobs: ['教师', '咨询师', '社工', '护士', 'HR'] },
          'E': { name: '企业型 (Enterprising)', desc: '喜欢影响、领导他人，追求成就和影响力', jobs: ['经理', '销售', '创业者', '律师', '政治家'] },
          'C': { name: '常规型 (Conventional)', desc: '喜欢有条理、系统化的工作，注重细节和规则', jobs: ['会计', '行政', '银行职员', '秘书', '审计'] },
        }
      },
      disc: {
        title: 'DISC 性格测评',
        desc: '了解你的行为风格和沟通偏好',
        color: '#F59E0B',
        icon: 'fa-chart-pie',
        questions: [
          { q: '在团队中，我通常：', a: '主动承担领导角色，发号施令', b: '热情带动气氛，鼓励大家', c: '耐心倾听，保持团队和谐', d: '严谨细致，确保质量' },
          { q: '面对压力时，我倾向于：', a: '直接面对，快速解决', b: '找人倾诉，寻求支持', c: '保持冷静，慢慢适应', d: '仔细分析，避免出错' },
          { q: '做决定时，我更看重：', a: '结果和效率', b: '他人的认同', c: '稳定和安全', d: '准确和事实' },
          { q: '别人眼中的我通常是：', a: '果断有魄力', b: '热情有魅力', c: '友善可靠', d: '严谨专业' },
          { q: '我更喜欢的工作环境是：', a: '有挑战、有竞争', b: '人际关系好、有趣', c: '稳定、变化少', d: '规范、有标准' },
          { q: '沟通时我通常：', a: '直接了当，直奔主题', b: '善于表达，有感染力', c: '温和耐心，善于倾听', d: '注意细节，逻辑清晰' },
          { q: '面对新任务我会：', a: '立即行动，边做边调整', b: '充满热情，拉人一起做', c: '慢慢来，先熟悉情况', d: '先做计划，按部就班' },
          { q: '我最讨厌：', a: '被人指挥，效率低下', b: '被人忽视，枯燥无聊', c: '冲突矛盾，突然变化', d: '混乱无序，错误批评' },
        ],
        dimensions: { D: '支配型', I: '影响型', S: '稳健型', C: '谨慎型' }
      },
      values: {
        title: '职业价值观测评',
        desc: '探索你在职业中最看重的因素',
        color: '#10B981',
        icon: 'fa-heart',
        questions: [
          { q: '工作中最重要的是：', a: '高薪收入和福利待遇', b: '工作稳定有保障', c: '能发挥自己的才能', d: '良好的人际关系', e: '能帮助他人，贡献社会' },
          { q: '我更看重：', a: '晋升机会和发展空间', b: '工作生活平衡', c: '工作的自主性和自由度', d: '工作的挑战性和新鲜感', e: '工作环境舒适' },
          { q: '如果工作与价值观冲突，我会：', a: '优先考虑收入', b: '先做着看', c: '很难接受，考虑换工作', d: '和领导沟通调整', e: '直接离职' },
          { q: '理想的上司应该：', a: '能给我高回报', b: '公平公正', c: '认可我的能力', d: '友善好相处', e: '有社会责任感' },
          { q: '选择工作时，我最优先考虑：', a: '薪资水平', b: '公司稳定性', c: '成长空间', d: '团队氛围', e: '社会价值' },
          { q: '我认为职业成功是：', a: '赚很多钱', b: '安稳做到退休', c: '成为领域专家', d: '有很多好朋友', e: '对社会有贡献' },
          { q: '我愿意为了什么加班：', a: '加班费高', b: '赶重要项目', c: '学到新东西', d: '帮同事/团队', e: '有意义的项目' },
          { q: '十年后我希望自己：', a: '财务自由', b: '工作稳定', c: '专业上有成就', d: '家庭幸福，工作顺心', e: '做了很多有意义的事' },
        ],
        values: ['薪酬待遇', '工作稳定', '成长发展', '人际和谐', '社会价值', '工作自主', '工作挑战', '生活平衡']
      }
    };

    let assessmentState = {
      current: null,
      step: 0,
      answers: {},
      results: {}
    };

    // AI Interview State
    let interviewState = {
      step: 0,
      messages: [],
      traits: {
        workStyle: null,
        teamStyle: null,
        pressureResponse: null,
        motivation: null,
        decisionStyle: null,
        careerGoal: null,
        learningStyle: null,
        conflictStyle: null
      }
    };

    const INTERVIEW_QUESTIONS = [
      {
        id: 'intro',
        ai: '你好！我是你的AI职业规划师小职。接下来我们通过一些轻松的对话，帮我更好地了解你，这样推荐的岗位会更贴合你的性格哦~ 先从一个简单的问题开始：当你接到一个新任务时，你通常会怎么开始？',
        quickReplies: ['先做好详细计划再动手', '边做边调整，快速行动', '先和别人讨论一下思路', '先收集足够信息再开始'],
        trait: 'workStyle'
      },
      {
        id: 'team',
        ai: '有意思！那在团队合作中，你一般扮演什么角色呢？比如是那个出主意的、协调大家的、还是默默把事情做好的？',
        quickReplies: ['出谋划策的创意担当', '协调推进的组织者', '踏实执行的实干家', '鼓舞士气的氛围担当'],
        trait: 'teamStyle'
      },
      {
        id: 'pressure',
        ai: '了解~ 那如果项目临近截止日期，压力很大的时候，你通常会怎么应对？',
        quickReplies: ['专注高效完成，压力就是动力', '有点焦虑但还是能按时完成', '需要和同事/朋友聊聊减压', '提前做好就不会有压力啦'],
        trait: 'pressureResponse'
      },
      {
        id: 'motivation',
        ai: '很棒！那什么最能激发你的工作热情呢？是攻克难题的成就感、学到新东西、还是得到别人的认可？',
        quickReplies: ['解决难题的成就感', '不断学习新东西', '获得他人认可和赞赏', '创造实际价值和影响'],
        trait: 'motivation'
      },
      {
        id: 'decision',
        ai: '明白啦~ 做重要决定的时候，你更相信什么？是理性分析、直觉感觉、还是会参考很多人的意见？',
        quickReplies: ['理性分析数据和事实', '相信自己的直觉', '广泛征求他人意见', '综合考虑后谨慎决定'],
        trait: 'decisionStyle'
      },
      {
        id: 'career',
        ai: '说得很好！那展望3-5年后，你希望自己在职业上成为什么样的人？比如技术专家、管理者、还是有自己的事业？',
        quickReplies: ['技术/专业领域的专家', '带团队的管理者', '自己创业做一番事业', '工作生活平衡就好'],
        trait: 'careerGoal'
      },
      {
        id: 'learning',
        ai: '很有想法！最后一个问题：你最喜欢用什么方式学习新技能？比如看书、做项目、还是有人带教？',
        quickReplies: ['做实际项目边做边学', '系统看书/看教程', '和高手交流请教', '上课/参加培训'],
        trait: 'learningStyle'
      }
    ];

    // ============ ACCOUNTS ============
    // 生成本地 SVG 头像（避免远程图片加载失败）
    function makeLocalAvatar(name, color1, color2) {
      const initials = name.length >= 2 ? name.slice(0, 2).toUpperCase() : name.charAt(0).toUpperCase();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1}"/>
          <stop offset="100%" style="stop-color:${color2}"/>
        </linearGradient></defs>
        <circle cx="64" cy="64" r="64" fill="url(#g)"/>
        <text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" font-family="Sora, sans-serif" font-size="52" font-weight="700" fill="#fff">${initials}</text>
      </svg>`;
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    }

    const ACCOUNTS = [
      { id:'a1', name:'张明', avatar: makeLocalAvatar('张明', '#6D5EF6', '#0EA5B7'), major:'计算机科学', grade:'大三', target:'前端开发工程师', email:'zhangming@edu.cn', school:'某某科技大学', bio:'热爱前端工程，熟悉 React 生态，正在系统补齐 TypeScript 与工程化能力，希望毕业后进入互联网大厂从事前端开发。', greeting:'早上好', matchPercent:73, gapPercent:27, tasksPending:3, tasksDone:12, studyHours:46, jobTags:['JavaScript/ES6+', 'React', 'TypeScript', 'HTML/CSS', '工程化'], jobColor:'#6d5ef6', registrationDate:'2026-03-15', learningDays:12 },
      { id:'a2', name:'李华', avatar: makeLocalAvatar('李华', '#10B981', '#0EA5B7'), major:'软件工程', grade:'大四', target:'后端开发工程师', email:'lihua@edu.cn', school:'某某理工大学', bio:'专注后端架构与分布式系统，熟悉 Java / Go，希望深入微服务与云原生方向。', greeting:'早上好', matchPercent:68, gapPercent:32, tasksPending:4, tasksDone:15, studyHours:62, jobTags:['Java', 'Spring Boot', 'MySQL', '微服务', 'Redis'], jobColor:'#10B981', registrationDate:'2026-02-20', learningDays:18 },
      { id:'a3', name:'王悦', avatar: makeLocalAvatar('王悦', '#EC4899', '#8B5CF6'), major:'数字媒体技术', grade:'大二', target:'UI/UX 设计师', email:'wangyue@edu.cn', school:'某某艺术学院', bio:'视觉设计爱好者，擅长 Figma / Sketch，正在学习交互设计与用户研究方法。', greeting:'早上好', matchPercent:52, gapPercent:48, tasksPending:5, tasksDone:6, studyHours:28, jobTags:['Figma', '视觉设计', '交互原型', '用户研究', '动效设计'], jobColor:'#EC4899', registrationDate:'2026-04-01', learningDays:7 },
    ];
    
    // 深拷贝账号对象，防止修改污染 ACCOUNTS 数组
    function cloneAccount(account) {
      return JSON.parse(JSON.stringify(account));
    }
    
    // 清理已损坏的 localStorage 数据（仅清理预设账号中已损坏的数据，保留用户注册的账号）
    (function cleanCorruptedState() {
      const saved = loadState();
      if (saved && saved.id) {
        // 用户注册的账号（id 以 'user_' 开头）不需要验证，直接保留
        if (saved.id.startsWith('user_')) return;
        
        const originalAccount = ACCOUNTS.find(a => a.id === saved.id);
        // 如果找不到对应预设账号，或者账号名/邮箱不匹配，说明数据已损坏
        if (!originalAccount || originalAccount.name !== saved.name || originalAccount.email !== saved.email) {
          localStorage.removeItem(STATE_STORAGE_KEY);
        }
      }
    })();
    
    // 使用深拷贝，避免修改原始 ACCOUNTS 对象
    let currentAccount = cloneAccount(ACCOUNTS[0]);
    
    // 页面加载时恢复持久化状态（支持预设账号和用户注册账号）
    (function restoreState() {
      const saved = loadState();
      if (saved && saved.id) {
        // 用户注册的账号（id 以 'user_' 开头），直接使用保存的数据
        if (saved.id.startsWith('user_')) {
          currentAccount = cloneAccount(saved);
          // 确保关键字段存在，防止旧数据或损坏数据导致异常显示
          if (!currentAccount.registrationDate) {
            const today = new Date();
            currentAccount.registrationDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
          }
          if (typeof currentAccount.tasksDone !== 'number') currentAccount.tasksDone = 0;
          if (typeof currentAccount.tasksPending !== 'number') currentAccount.tasksPending = 0;
          if (typeof currentAccount.studyHours !== 'number') currentAccount.studyHours = 0;
          if (typeof currentAccount.learningDays !== 'number') currentAccount.learningDays = 0;
          if (typeof currentAccount.matchPercent !== 'number') currentAccount.matchPercent = 0;
          if (!currentAccount.jobTags) currentAccount.jobTags = [];
          if (!currentAccount.target || currentAccount.target === '待规划') {
            currentAccount.target = '前端开发工程师';
          }
          if (typeof currentAccount.isNewUser !== 'boolean') currentAccount.isNewUser = currentAccount.tasksDone === 0;
          // 持久化修正后的数据
          saveState();
          return;
        }
        
        // 预设账号：使用新的本地 SVG 头像，忽略旧数据中的远程 URL
        const base = ACCOUNTS.find(a => a.id === saved.id);
        if (base) {
          currentAccount = cloneAccount(base);
          // 应用旧数据，但保留新的本地头像（如果旧头像是远程 URL）
          const savedAvatar = saved.avatar;
          const isRemoteUrl = savedAvatar && savedAvatar.startsWith('http');
          applySavedStateToAccount(saved);
          // 如果旧数据中的头像是远程 URL，使用新的本地头像
          if (isRemoteUrl) {
            currentAccount.avatar = base.avatar;
          }
        }
      }
    })();

    function renderAccountList() {
      const list = document.getElementById('account-list');
      if (!list) return;
      list.innerHTML = ACCOUNTS.map(a => {
        const isCurrent = a.id === currentAccount.id;
        return '<button class="w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition ' + (isCurrent ? 'bg-white/8' : 'hover:bg-white/5') + '" onclick="switchAccount(\'' + a.id + '\')">' +
          '<img src="' + a.avatar + '" class="w-7 h-7 rounded-full" alt="" />' +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-[12px] font-semibold text-white truncate">' + a.name + (isCurrent ? ' <span class="text-[10px] text-brand-purpleLight">(当前)</span>' : '') + '</div>' +
            '<div class="text-[10px] text-gray-400 truncate">' + a.major + ' · ' + a.grade + '</div>' +
          '</div>' +
          (isCurrent ? '<i class="fa-solid fa-check text-brand-purpleLight text-xs"></i>' : '') +
        '</button>';
      }).join('');
    }

    function toggleUserMenu(e) {
      if (e) e.stopPropagation();
      const dd = document.getElementById('user-dropdown');
      if (dd.classList.contains('hidden')) {
        renderAccountList();
        dd.classList.remove('hidden');
      } else {
        dd.classList.add('hidden');
      }
    }
    function closeUserMenu() {
      document.getElementById('user-dropdown').classList.add('hidden');
    }
    function switchAccount(id) {
      const acc = ACCOUNTS.find(a => a.id === id);
      if (!acc || acc.id === currentAccount.id) { closeUserMenu(); return; }
      // 使用深拷贝，避免修改污染原始 ACCOUNTS 对象
      currentAccount = cloneAccount(acc);
      applyAccountToUI();
      saveState(); // P0：切换账号后持久化
      closeUserMenu();
      showToast('已切换到 ' + acc.name + ' 的账号', 'check');
    }
    function applyAccountToUI() {
      const a = currentAccount;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      const setSrc = (id, val) => { const el = document.getElementById(id); if (el) el.src = val; };

      // Helper: generate initials avatar SVG
      const makeInitialsAvatar = (name) => {
        if (!name) return '';
        const initials = name.length >= 2 ? name.slice(0, 2).toUpperCase() : name.charAt(0).toUpperCase();
        const colors = [
          ['#6D5EF6', '#0EA5B7'],
          ['#F59E0B', '#EF4444'],
          ['#10B981', '#0EA5B7'],
          ['#6D5EF6', '#EC4899'],
          ['#3B82F6', '#6D5EF6']
        ];
        const colorIdx = name.charCodeAt(0) % colors.length;
        const [c1, c2] = colors[colorIdx];
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
          <defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${c1}"/>
            <stop offset="100%" style="stop-color:${c2}"/>
          </linearGradient></defs>
          <rect width="80" height="80" rx="40" fill="url(#sg)"/>
          <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Sora, sans-serif" font-size="32" font-weight="700" fill="white">${initials}</text>
        </svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      };

      const avatarSrc = a.avatar || makeInitialsAvatar(a.name);
      
      // 更新侧边栏头像（带加载失败 fallback）
      const sidebarAvatarEl = document.getElementById('sidebar-avatar');
      if (sidebarAvatarEl) {
        sidebarAvatarEl.src = avatarSrc;
        sidebarAvatarEl.onerror = function() {
          if (!this.dataset.fallback) {
            this.dataset.fallback = '1';
            this.src = makeInitialsAvatar(a.name);
          }
        };
      }
      set('sidebar-name', a.name);
      set('sidebar-meta', a.major + ' · ' + a.grade);
      set('hero-name', a.name);

      // Profile avatar handling - 使用类名+内联样式双重控制确保显示
      const profileAvatarImg = document.getElementById('profile-avatar-img');
      const profileAvatarContainer = document.getElementById('profile-avatar-uploader');
      const profileInitials = document.getElementById('profile-avatar-initials');
      const profilePlaceholder = document.getElementById('profile-avatar-placeholder');
      
      if (profileAvatarImg && profileAvatarContainer) {
        const hasValidAvatar = a.avatar && typeof a.avatar === 'string' && a.avatar.length > 0;
        if (hasValidAvatar) {
          profileAvatarImg.src = a.avatar;
          profileAvatarImg.style.display = 'block';
          profileAvatarImg.style.visibility = 'visible';
          profileAvatarImg.onerror = function() {
            if (!this.dataset.fallback) {
              this.dataset.fallback = '1';
              this.src = makeInitialsAvatar(a.name);
              // 图片加载失败时，降级显示首字母
              if (profileInitials) {
                const initials = a.name ? (a.name.length >= 2 ? a.name.slice(0, 2).toUpperCase() : a.name.charAt(0).toUpperCase()) : 'U';
                profileInitials.textContent = initials;
                profileInitials.style.display = 'flex';
              }
            }
          };
          profileAvatarContainer.classList.add('has-avatar');
          if (profilePlaceholder) profilePlaceholder.style.display = 'none';
          if (profileInitials) profileInitials.style.display = 'none';
        } else {
          profileAvatarContainer.classList.remove('has-avatar');
          profileAvatarImg.style.display = 'none';
          profileAvatarImg.style.visibility = 'hidden';
          profileAvatarImg.onerror = null;
          if (profileInitials) {
            const initials = a.name ? (a.name.length >= 2 ? a.name.slice(0, 2).toUpperCase() : a.name.charAt(0).toUpperCase()) : 'U';
            profileInitials.textContent = initials;
            profileInitials.style.display = 'flex';
          }
          if (profilePlaceholder) profilePlaceholder.style.display = 'flex';
        }
      }

      set('profile-name', a.name);
      set('profile-meta', a.major + ' · ' + a.grade);
      set('profile-target', '目标：' + a.target);
      set('profile-email', a.email.replace(/(.{2}).*(@.*)/, '$1***$2'));
      
      // 动态渲染注册时间和学习天数
      set('profile-registration-date', a.registrationDate || '--');
      set('profile-learning-days', (a.learningDays || 0) + ' 天');
      
      // 动态渲染个人中心统计卡片
      set('profile-stat-days', a.learningDays || 0);
      set('profile-stat-tasks', a.tasksDone || 0);
      set('profile-stat-match', a.matchPercent || 0);
      
      // 动态渲染技能进度条
      renderProfileSkillBars(a);
      
      // 动态渲染目标岗位匹配分析卡片
      renderProfileGoalCard(a);
      
      // 动态渲染学习活跃度热力图文字
      const heatmapText = document.getElementById('profile-heatmap-text');
      const heatmapCount = document.getElementById('profile-heatmap-count');
      if (heatmapText && heatmapCount) {
        const days = a.learningDays || 0;
        if (days > 0) {
          heatmapText.textContent = '已连续学习 ' + days + ' 天，继续保持！';
          heatmapCount.textContent = days + '/12';
        } else {
          heatmapText.textContent = '暂无学习记录，开始第一个任务吧！';
          heatmapCount.textContent = '0/12';
        }
      }
      
      const greetingEl = document.querySelector('.hero-greeting');
      if (greetingEl) greetingEl.textContent = (a.greeting || '早上好') + '，';
      const matchTextEl = document.querySelector('.hero-match-text');
      if (matchTextEl) matchTextEl.textContent = '你目前与目标岗位「' + a.target + '」匹配度为';
      const gapTextEl = document.querySelector('.hero-gap-text');
      if (gapTextEl) gapTextEl.textContent = a.gapPercent + '% 的技能差距可通过任务驱动补全';
      const targetJobEls = document.querySelectorAll('.hero-target-job');
      targetJobEls.forEach(el => el.textContent = a.target);
      const resumeTarget = document.getElementById('resume-target-job');
      if (resumeTarget) resumeTarget.textContent = a.target;
      const resumeTargetSub = document.getElementById('resume-target-job-sub');
      if (resumeTargetSub) resumeTargetSub.textContent = a.target;

      // Profile form
      const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      f('form-username', a.name);
      f('form-email', a.email);
      f('form-school', a.school);
      f('form-major', a.major);
      f('form-grade', a.grade);
      f('form-target', a.target);
      f('form-bio', a.bio);
      
      updateRecommendations(a);
      updateSkillGaps(a);
      updateTasks(a);
      updateDashboardStats(a);
      // P1：根据目标岗位动态切换简历左栏"理想候选人样板"
      applyJobTemplate(a.target);
    }
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('user-dropdown');
      const card = document.getElementById('sidebar-user-card');
      if (dd && !dd.classList.contains('hidden') && !dd.contains(e.target) && card && !card.contains(e.target)) {
        dd.classList.add('hidden');
      }
    });

    // ============ PAGE SWITCHING ============
    function switchPage(pageId) {
      document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.removeProperty('opacity'); // Reset before re-adding
      });
      const target = document.getElementById('page-' + pageId);
      if (target) {
        target.classList.add('active');
        // Force reset opacity to prevent animation stuck at 0
        target.style.setProperty('opacity', '1', 'important');
        // Trigger reflow to restart animation
        void target.offsetWidth;
      }

      document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
      const nav = document.querySelector('.nav-item[data-page="' + pageId + '"]');
      if (nav) nav.classList.add('active');

      const bc = document.getElementById('breadcrumb');
      if (bc) bc.textContent = PAGE_LABELS[pageId] || '';

      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (pageId === 'resume') {
        setResumeFlowStep(1);
      }

      // 切换到 profile 页面时，重新应用账号信息（确保头像等数据同步）
      if (pageId === 'profile') {
        // 使用重试机制确保 DOM 元素已经就绪
        let retries = 0;
        const maxRetries = 5;
        const tryApplyAccount = () => {
          const profileAvatarImg = document.getElementById('profile-avatar-img');
          if (profileAvatarImg) {
            applyAccountToUI();
            // 验证头像是否正确显示
            if (currentAccount && currentAccount.avatar) {
              console.log('[Profile] Applying avatar:', currentAccount.avatar.substring(0, 50) + '...');
            }
          } else if (retries < maxRetries) {
            retries++;
            setTimeout(tryApplyAccount, 100);
          }
        };
        setTimeout(tryApplyAccount, 100);
      }

      // Lazy init charts after container is visible
      setTimeout(() => {
        if (pageId === 'dashboard' && !chartsInit.dashboard) {
          initDashboardCharts();
          chartsInit.dashboard = true;
        }
        if (pageId === 'market' && !chartsInit.market) {
          initMarketPage();
          chartsInit.market = true;
        }
        if (pageId === 'interview' && !chartsInit.interview) {
          initInterviewHistoryChart();
          chartsInit.interview = true;
        }
        if (charts[pageId]) {
          Object.values(charts[pageId]).forEach(c => c && c.resize());
        }
      }, 80);
    }

    // nav click binding
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => switchPage(item.dataset.page));
    });

    // ============ STEP WIZARD ============
    function goToStep(n) {
      document.querySelectorAll('.step-content').forEach(s => s.classList.add('hidden'));
      const target = document.getElementById('step-' + n);
      if (target) {
        target.classList.remove('hidden');
        target.style.animation = 'none';
        void target.offsetWidth;
        target.style.animation = 'pageIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      }
      // Update progress
      for (let i = 1; i <= 4; i++) {
        const c = document.getElementById('step-c-' + i);
        if (!c) continue;
        c.classList.remove('done', 'current');
        if (i < n) c.classList.add('done');
        else if (i === n) c.classList.add('current');
      }
      for (let i = 1; i <= 3; i++) {
        const l = document.getElementById('step-l-' + i);
        if (!l) continue;
        l.classList.toggle('done', i < n);
      }
      // Labels color
      document.querySelectorAll('[id^="step-c-"]').forEach((el, idx) => {
        const lbl = el.parentElement.querySelector('div:last-child');
        if (lbl) lbl.className = (idx + 1) <= n ? 'text-[11px] font-semibold text-content-text' : 'text-[11px] text-content-sub';
      });
      // Step 4: render recommendations
      if (n === 4) renderRecommendations();
      document.querySelector('#page-planning').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ============ PLAN PAGE ENTER KEY ============
    function initPlanPageKeyboard() {
      const planPage = document.getElementById('page-planning');
      if (!planPage) return;
      planPage.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          const activePage = document.querySelector('.page.active');
          if (activePage && activePage.id === 'page-planning') {
            const currentActive = document.querySelector('.step-content:not(.hidden)');
            if (currentActive) {
              const stepMatch = currentActive.id.match(/step-(\d+)/);
              if (stepMatch) {
                const currentStep = parseInt(stepMatch[1]);
                const nextBtn = currentActive.querySelector('[data-next-step], .btn-primary');
                const tagInput = document.getElementById('plan-tag-input');
                if (document.activeElement === tagInput) return;
                e.preventDefault();
                if (nextBtn) {
                  nextBtn.click();
                } else if (currentStep < 4) {
                  goToStep(currentStep + 1);
                }
              }
            }
          }
        }
      });
    }

    // ============ EXPERIENCE TEXTAREA ============
    const expTa = document.getElementById('exp-textarea');
    if (expTa) {
      expTa.addEventListener('input', () => {
        document.getElementById('exp-count').textContent = expTa.value.length + ' 字';
      });
    }

    // ============ REPORT TEXTAREA (submit modal) ============
    const reportTa = document.querySelector('#submit-type-B textarea');
    if (reportTa) {
      reportTa.addEventListener('input', () => {
        const cnt = document.getElementById('report-count');
        if (cnt) cnt.textContent = reportTa.value.length;
      });
    }

    // ============ MAJOR SEARCH INIT ============
    // 专业联想搜索组件将在下面的初始化代码块中创建

    // ============ CHIPS ============
    // chip 绑定 — moved to load callback (after fragments ready)

    // ============ RECOMMENDATIONS ============
    const RECOMMEND_JOBS = [
      { title: '前端开发工程师', company: '字节跳动', match: 92, salary: '25-40K', tags: ['React', 'TypeScript', '前端工程化'], reason: '与你的技术栈高度匹配，React 经验是核心加分项' },
      { title: '前端开发工程师', company: '腾讯', match: 88, salary: '22-35K', tags: ['Vue', 'Node.js', 'Web 性能'], reason: '你的 Vue 与工程化能力契合，软技能维度突出' },
      { title: '全栈开发工程师', company: '美团', match: 76, salary: '20-32K', tags: ['React', 'Node.js', 'MySQL'], reason: '建议补齐后端与数据库知识，匹配度潜力大' },
      { title: 'Web 前端工程师', company: '网易', match: 71, salary: '18-28K', tags: ['JavaScript', 'Canvas', '动画'], reason: '你的 JS 基础扎实，建议加强可视化与动画方向' },
      { title: '前端开发实习生', company: '小红书', match: 85, salary: '300-400/天', tags: ['React', 'TypeScript', '小程序'], reason: '实习方向与你的兴趣标签匹配，入门门槛适中' },
    ];
    function renderRecommendations() {
      const list = document.getElementById('recommend-list');
      if (!list) return;
      list.innerHTML = RECOMMEND_JOBS.map((j, i) => {
        const tier = j.match >= 80 ? '高度匹配' : (j.match >= 60 ? '较好匹配' : '潜力岗位');
        const tierColor = j.match >= 80 ? '#10B981' : (j.match >= 60 ? '#F59E0B' : '#6B7280');
        return '<div class="rounded-xl border border-content-divider p-4 hover:border-brand-purple hover:shadow-card-hover transition cursor-pointer" style="animation:fadeUp 0.5s ease ' + (i * 0.08) + 's backwards">' +
          '<div class="flex items-start justify-between gap-3 mb-2">' +
            '<div><div class="font-display font-bold text-base text-content-text">' + j.title + '</div>' +
            '<div class="text-[12px] text-content-sub mt-0.5">' + j.company + ' · ' + j.salary + '</div></div>' +
            '<div class="text-right"><div class="font-display font-extrabold text-xl" style="color:#7B4FE0">' + j.match + '%</div>' +
            '<span class="badge" style="background:' + tierColor + '20;color:' + tierColor + '">' + tier + '</span></div>' +
          '</div>' +
          '<div class="match-bar mb-2"><div class="match-fill" style="width:' + j.match + '%"></div></div>' +
          '<p class="text-[12px] text-content-sub mb-2"><i class="fa-solid fa-lightbulb text-brand-cyan mr-1"></i>' + j.reason + '</p>' +
          '<div class="flex flex-wrap gap-1.5">' + j.tags.map(t => '<span class="chip" style="font-size:11px;padding:2px 8px">' + t + '</span>').join('') + '</div>' +
        '</div>';
      }).join('');
    }

    // ============ GAP TOGGLE ============
    function toggleGap() {
      const t = document.getElementById('gap-toggle');
      t.classList.toggle('on');
      document.body.classList.toggle('gap-disabled', !t.classList.contains('on'));
      showToast(t.classList.contains('on') ? '差距高亮已开启' : '差距高亮已关闭', 'check');
    }

    // ============ TEMPLATE DRAWER ============
    function toggleTemplateDrawer() {
      const drawer = document.getElementById('template-drawer');
      const overlay = document.getElementById('template-drawer-overlay');
      if (!drawer || !overlay) return;
      const isOpen = !drawer.classList.contains('translate-x-full');
      if (isOpen) {
        drawer.classList.add('translate-x-full');
        overlay.classList.add('hidden');
      } else {
        drawer.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
      }
    }

    // ============ FLOW INDICATOR ============
    function setResumeFlowStep(step) {
      const items = ['flow-ind-1', 'flow-ind-2', 'flow-ind-3'];
      const lines = ['flow-line-1', 'flow-line-2'];
      items.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (i < step) {
          el.classList.add('active-step');
        } else {
          el.classList.remove('active-step');
        }
      });
      lines.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.background = i < step - 1 ? 'linear-gradient(90deg, #6d5ef6, #0ea5b7)' : '';
      });
    }

    // ============ DIAGNOSIS VIEW SWITCH ============
    function switchDiagnosisView(view, btn) {
      document.querySelectorAll('.diag-view').forEach(v => v.classList.add('hidden'));
      const target = document.getElementById('diag-view-' + view);
      if (target) target.classList.remove('hidden');
      document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
      if (btn) btn.classList.add('active');
      // Lazy init radar
      if (view === 'radar' && !chartsInit.diagnosisRadar) {
        setTimeout(() => {
          initDiagnosisRadar();
          chartsInit.diagnosisRadar = true;
        }, 80);
      }
      if (view === 'radar' && charts.diagnosisRadar) {
        setTimeout(() => charts.diagnosisRadar.resize(), 100);
      }
    }

    // ============ SKILL SORT & RENDER ============
    let skillSortMethod = 'gap';

    function sortSkillsBy(method) {
      skillSortMethod = method;
      const list = document.getElementById('skill-gaps-list');
      if (!list) return;
      const items = Array.from(list.querySelectorAll(':scope > .rounded-xl, :scope > div'));
      const nameEl = (item) => item.querySelector('.font-semibold');
      const badgeEl = (item) => item.querySelector('.badge');
      const statusRank = { '已掌握': 0, '待提升': 1, '未掌握': 2, '待学习': 3, '未解锁': 4 };
      items.sort((a, b) => {
        const nameA = nameEl(a)?.textContent.trim() || '';
        const nameB = nameEl(b)?.textContent.trim() || '';
        const statusA = badgeEl(a)?.textContent.trim() || '';
        const statusB = badgeEl(b)?.textContent.trim() || '';
        switch (method) {
          case 'gap':
            return (statusRank[statusA] ?? 99) - (statusRank[statusB] ?? 99);
          case 'alpha':
            return nameA.localeCompare(nameB, 'zh-CN');
          case 'priority':
            const priorityA = (statusA === '未掌握' || statusA === '待学习') ? 0 : (statusA === '待提升' ? 1 : 2);
            const priorityB = (statusB === '未掌握' || statusB === '待学习') ? 0 : (statusB === '待提升' ? 1 : 2);
            return priorityA - priorityB;
          default:
            return 0;
        }
      });
      items.forEach(item => list.appendChild(item));
      const sortBtn = document.getElementById('skill-sort-btn');
      if (sortBtn) {
        const labels = { gap: '按差距', alpha: '按字母', priority: '按优先级' };
        sortBtn.textContent = labels[method] || '排序';
      }
    }

    window.renderSkillList = function(mode) {
      const list = document.getElementById('skill-gaps-list');
      if (!list) return;
      const skills = (currentAccount.jobTags || []).slice(0, 8);
      const isNew = currentAccount.isNewUser;
      let html = '';
      skills.forEach((skill, i) => {
        let status, badgeClass, dotClass, percent;
        if (isNew) {
          status = i === 0 ? '待提升' : '待学习';
          badgeClass = i === 0 ? 'badge-verifying' : 'badge-pending';
          dotClass = i === 0 ? 'dot-improve' : 'dot-missing';
          percent = i === 0 ? 25 : 0;
        } else {
          if (i < 2) { status = '已掌握'; badgeClass = 'badge-passed'; dotClass = 'dot-mastered'; percent = 85 + Math.floor(Math.random() * 10); }
          else if (i === 2) { status = '待提升'; badgeClass = 'badge-verifying'; dotClass = 'dot-improve'; percent = 55 + Math.floor(Math.random() * 10); }
          else { status = '未掌握'; badgeClass = 'badge-rejected'; dotClass = 'dot-missing'; percent = 10 + Math.floor(Math.random() * 20); }
        }
        html += '<div class="rounded-xl border border-content-divider p-4 hover:border-brand-purple transition">' +
          '<div class="flex items-center justify-between mb-1">' +
          '<div class="flex items-center gap-2">' +
          '<span class="dot ' + dotClass + '"></span>' +
          '<span class="font-semibold text-content-text">' + skill + '</span>' +
          '<span class="badge ' + badgeClass + '">' + status + '</span>' +
          '</div>' +
          '<span class="text-[11px] text-content-sub">掌握度 ' + percent + '%</span>' +
          '</div>' +
          '<p class="text-[12px] text-content-sub">' + (status === '已掌握' ? '基础扎实，建议在实战中巩固' : (status === '待提升' ? '这是目标岗位的核心技能，建议优先学习' : '需要系统学习并通过项目实践掌握')) + '</p>' +
          '</div>';
      });
      list.innerHTML = html;
      if (typeof sortSkillsBy === 'function') sortSkillsBy(skillSortMethod);
    };

    // ============ MODAL ============
    let currentSubmitType = 'A';
    function openSubmitModal(taskName, type) {
      document.getElementById('modal-task-name').textContent = taskName;
      switchSubmitType(type);
      document.getElementById('submit-modal').classList.add('show');
      document.body.style.overflow = 'hidden';
    }
    function closeSubmitModal() {
      document.getElementById('submit-modal').classList.remove('show');
      document.body.style.overflow = '';
    }
    function switchSubmitType(type) {
      currentSubmitType = type;
      document.querySelectorAll('.submit-type').forEach(s => s.classList.add('hidden'));
      document.getElementById('submit-type-' + type).classList.remove('hidden');
      document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('type-tab-' + type).classList.add('active');
      // Update report count
      if (type === 'B') {
        const ta = document.querySelector('#submit-type-B textarea');
        const cnt = document.getElementById('report-count');
        if (ta && cnt) cnt.textContent = ta.value.length;
      }
    }
    function handleSubmit() {
      // Basic validation
      if (currentSubmitType === 'A') {
        const url = document.querySelector('#submit-type-A input[type="text"]').value.trim();
        if (!url || !/^https?:\/\/.+\..+/.test(url)) {
          showToast('请填写有效的代码仓库地址', 'info');
          return Promise.resolve();
        }
      } else {
        const text = document.querySelector('#submit-type-B textarea').value.trim();
        if (text.length < 100) {
          showToast('心得报告需至少 100 字，当前 ' + text.length + ' 字', 'info');
          return Promise.resolve();
        }
      }
      closeSubmitModal();
      showToast('成果物已提交，AI 正在验证中...', 'robot');
      // 返回 Promise，让 withLoading 能在验证完成后恢复按钮
      return new Promise(resolve => {
        setTimeout(() => {
          showToast('AI 验证完成，结果已生成', 'check');
          triggerConfetti();
          // P0：任务提交状态回写，让平台"运转起来"
          currentAccount.tasksDone = (currentAccount.tasksDone || 0) + 1;
          currentAccount.studyHours = (currentAccount.studyHours || 0) + 4; // 假设当前任务 4h
          currentAccount.learningDays = (currentAccount.learningDays || 0) + 1;
          // 点亮简历亮点区块（预埋的 #resume-highlight-area）
          const highlightArea = document.getElementById('resume-highlight-area');
          if (highlightArea) highlightArea.style.display = 'block';
          // 刷新 Dashboard 与任务中心的数据
          try { updateDashboardStats(currentAccount); } catch (e) { console.warn(e); }
          try { updateTasks(currentAccount); } catch (e) { console.warn(e); }
          // 持久化
          saveState();
          resolve();
        }, 2200);
      });
    }
    function addAttachment(kind) {
      const text = window.prompt('请输入' + kind + '地址或名称：', kind === '链接' ? 'https://' : '');
      if (text && text.trim()) {
        const list = document.getElementById('attachment-list');
        const item = document.createElement('div');
        item.className = 'flex items-center gap-2 text-[12px] text-content-text bg-content-bg rounded-lg px-3 py-2';
        const icon = kind === '附件' ? 'fa-paperclip' : kind === '图片' ? 'fa-image' : 'fa-link';
        item.innerHTML = '<i class="fa-solid ' + icon + ' text-brand-purple text-[11px]"></i><span class="flex-1 truncate">' + text.trim() + '</span><button class="text-content-sub hover:text-state-danger" onclick="this.parentNode.remove()"><i class="fa-solid fa-xmark text-[10px]"></i></button>';
        list.appendChild(item);
      }
    }
    // close modal on overlay click — moved to load callback (after fragments ready)
    // close on Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSubmitModal();
    });

    // ============ PROFILE SAVE ============
    function saveProfile() {
      const name = document.getElementById('form-username').value.trim();
      const email = document.getElementById('form-email').value.trim();
      const target = document.getElementById('form-target').value.trim();
      const major = document.getElementById('form-major').value.trim();
      const grade = document.getElementById('form-grade').value;
      const school = document.getElementById('form-school').value.trim();
      const bio = document.getElementById('form-bio').value.trim();
      if (!name) { showToast('请填写用户名', 'info'); return; }
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast('请填写有效邮箱', 'info'); return; }
      // Update current account
      currentAccount.name = name;
      currentAccount.email = email;
      currentAccount.target = target || currentAccount.target;
      currentAccount.major = major || currentAccount.major;
      currentAccount.grade = grade || currentAccount.grade;
      currentAccount.school = school || currentAccount.school;
      currentAccount.bio = bio || currentAccount.bio;
      applyAccountToUI();
      saveState(); // P0：保存后持久化
      showToast('个人信息已保存', 'check');
    }
    function resetProfile() {
      applyAccountToUI();
      showToast('已重置为最近一次保存的内容', 'info');
    }
    function changeAvatar() {
      // Random unsplash avatar as a demo
      const avatars = [
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&h=160&fit=crop&crop=faces',
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop&crop=faces',
        'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=160&h=160&fit=crop&crop=faces',
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&h=160&fit=crop&crop=faces',
      ];
      const next = avatars[Math.floor(Math.random() * avatars.length)];
      currentAccount.avatar = next;
      saveState(); // 保存更换的头像
      applyAccountToUI();
      showToast('头像已更换（演示）', 'check');
    }
    function addCustomChip(el) {
      const text = window.prompt('请输入自定义标签名称：', '');
      if (text && text.trim()) {
        const newChip = document.createElement('span');
        newChip.className = 'chip selected';
        newChip.textContent = text.trim();
        newChip.addEventListener('click', () => newChip.classList.toggle('selected'));
        el.parentNode.insertBefore(newChip, el);
      }
    }

    // ============ TOAST ============
    let toastTimer;
    function showToast(msg, icon) {
      const t = document.getElementById('toast');
      const m = document.getElementById('toast-msg');
      const i = document.getElementById('toast-icon');
      m.textContent = msg;
      i.className = 'fa-solid ' + (icon === 'robot' ? 'fa-robot text-brand-cyan' : icon === 'check' ? 'fa-circle-check text-state-success' : 'fa-circle-info text-brand-purple');
      t.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
    }

    // ============ GLOBAL MODAL HELPERS ============
    function openModal(id) {
      const m = document.getElementById(id);
      if (m) { m.classList.add('show'); document.body.style.overflow = 'hidden'; }
    }
    function closeModal(id) {
      const m = document.getElementById(id);
      if (m) { m.classList.remove('show'); document.body.style.overflow = ''; }
    }
    // Close any modal on overlay click — moved to load callback (after fragments ready)
    // Close any modal on Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show').forEach(m => {
          m.classList.remove('show');
          document.body.style.overflow = '';
        });
      }
    });

    // ============ CONFIRM MODAL ============
    let confirmCallback = null;
    function showConfirm(title, msg, type, onOk) {
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-msg').textContent = msg;
      const ok = document.getElementById('confirm-ok');
      const icon = document.getElementById('confirm-icon');
      // Reset icon/color based on type
      if (type === 'logout') {
        icon.style.background = 'rgba(244,63,94,0.1)';
        icon.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket text-state-danger text-xl"></i>';
        ok.style.background = '#F43F5E';
      } else {
        icon.style.background = 'rgba(244,63,94,0.1)';
        icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-state-danger text-xl"></i>';
        ok.style.background = '';
      }
      confirmCallback = onOk;
      openModal('confirm-modal');
    }
    // confirm-ok click binding — moved to load callback (after fragments ready)

    // ============ ASSESSMENT SYSTEM ============
    function startAssessment(type) {
      const data = ASSESSMENT_DATA[type];
      if (!data) return;

      assessmentState.current = type;
      assessmentState.step = 0;
      assessmentState.answers = {};

      const modal = document.getElementById('assessment-modal');
      document.getElementById('assessment-modal-title').textContent = data.title;
      document.getElementById('assessment-modal-desc').textContent = data.desc;
      document.getElementById('assessment-modal-icon').style.background = data.color + '1A';
      document.getElementById('assessment-modal-icon').innerHTML = '<i class="fa-solid ' + data.icon + '" style="color:' + data.color + '"></i>';

      renderAssessmentQuestion();
      openModal('assessment-modal');
    }

    function renderAssessmentQuestion() {
      const type = assessmentState.current;
      const data = ASSESSMENT_DATA[type];
      const q = data.questions[assessmentState.step];
      const total = data.questions.length;

      document.getElementById('assessment-progress-text').textContent = (assessmentState.step + 1) + ' / ' + total;
      document.getElementById('assessment-progress-bar').style.width = ((assessmentState.step + 1) / total * 100) + '%';
      document.getElementById('assessment-prev').disabled = assessmentState.step === 0;

      const nextBtn = document.getElementById('assessment-next');
      nextBtn.innerHTML = assessmentState.step === total - 1 ? '<i class="fa-solid fa-check mr-1.5"></i>完成测评' : '下一题<i class="fa-solid fa-arrow-right ml-1.5"></i>';

      const container = document.getElementById('assessment-questions');
      let optionsHtml = '';

      if (type === 'mbti') {
        optionsHtml = `
          <div class="space-y-3">
            <div class="assessment-option ${assessmentState.answers[assessmentState.step] === 'a' ? 'selected' : ''}" onclick="selectAssessmentOption('a')">
              <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 ${assessmentState.answers[assessmentState.step] === 'a' ? 'border-brand-purple bg-brand-purple' : 'border-gray-300'}">
                ${assessmentState.answers[assessmentState.step] === 'a' ? '<i class="fa-solid fa-check text-white text-[10px]"></i>' : ''}
              </div>
              <span class="text-[15px]">A. ${q.a}</span>
            </div>
            <div class="assessment-option ${assessmentState.answers[assessmentState.step] === 'b' ? 'selected' : ''}" onclick="selectAssessmentOption('b')">
              <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 ${assessmentState.answers[assessmentState.step] === 'b' ? 'border-brand-purple bg-brand-purple' : 'border-gray-300'}">
                ${assessmentState.answers[assessmentState.step] === 'b' ? '<i class="fa-solid fa-check text-white text-[10px]"></i>' : ''}
              </div>
              <span class="text-[15px]">B. ${q.b}</span>
            </div>
          </div>
        `;
      } else if (type === 'holland' || type === 'values') {
        const options = ['a', 'b', 'c', 'd', 'e'];
        const labels = type === 'holland' ? ['非常符合', '比较符合', '不确定', '不太符合', '不符合'] : ['A', 'B', 'C', 'D', 'E'];
        optionsHtml = '<div class="space-y-3">';
        options.forEach((opt, idx) => {
          const optText = q[opt] || labels[idx];
          optionsHtml += `
            <div class="assessment-option ${assessmentState.answers[assessmentState.step] === opt ? 'selected' : ''}" onclick="selectAssessmentOption('${opt}')">
              <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 ${assessmentState.answers[assessmentState.step] === opt ? 'border-brand-purple bg-brand-purple' : 'border-gray-300'}">
                ${assessmentState.answers[assessmentState.step] === opt ? '<i class="fa-solid fa-check text-white text-[10px]"></i>' : ''}
              </div>
              <span class="text-[15px]">${labels[idx] !== 'A' ? '' : String.fromCharCode(65 + idx) + '. '}${optText}</span>
            </div>
          `;
        });
        optionsHtml += '</div>';
      } else if (type === 'disc') {
        const options = ['a', 'b', 'c', 'd'];
        optionsHtml = '<div class="space-y-3">';
        options.forEach((opt, idx) => {
          const optText = q[opt];
          optionsHtml += `
            <div class="assessment-option ${assessmentState.answers[assessmentState.step] === opt ? 'selected' : ''}" onclick="selectAssessmentOption('${opt}')">
              <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 ${assessmentState.answers[assessmentState.step] === opt ? 'border-brand-purple bg-brand-purple' : 'border-gray-300'}">
                ${assessmentState.answers[assessmentState.step] === opt ? '<i class="fa-solid fa-check text-white text-[10px]"></i>' : ''}
              </div>
              <span class="text-[15px]">${String.fromCharCode(65 + idx)}. ${optText}</span>
            </div>
          `;
        });
        optionsHtml += '</div>';
      }

      container.innerHTML = `
        <div class="animate-fadeIn">
          <div class="text-[13px] text-content-sub mb-2">问题 ${assessmentState.step + 1} / ${total}</div>
          <h4 class="font-display font-bold text-lg text-content-text mb-6">${q.q}</h4>
          ${optionsHtml}
        </div>
      `;
    }

    function selectAssessmentOption(opt) {
      assessmentState.answers[assessmentState.step] = opt;
      renderAssessmentQuestion();
    }

    function assessmentPrev() {
      if (assessmentState.step > 0) {
        assessmentState.step--;
        renderAssessmentQuestion();
      }
    }

    function assessmentNext() {
      if (!assessmentState.answers[assessmentState.step]) {
        showToast('请先选择一个答案', 'info');
        return;
      }

      const type = assessmentState.current;
      const data = ASSESSMENT_DATA[type];
      const total = data.questions.length;

      if (assessmentState.step < total - 1) {
        assessmentState.step++;
        renderAssessmentQuestion();
      } else {
        calculateAndShowResult();
      }
    }

    function calculateAndShowResult() {
      const type = assessmentState.current;
      const answers = assessmentState.answers;
      let result = {};

      closeModal('assessment-modal');

      if (type === 'mbti') {
        let E = 0, I = 0, S = 0, N = 0, T = 0, F = 0, J = 0, P = 0;
        const dimensions = [
          ['E','I'], ['S','N'], ['T','F'], ['J','P'],
          ['E','I'], ['S','N'], ['T','F'], ['J','P'],
          ['E','I'], ['S','N']
        ];
        Object.keys(answers).forEach(k => {
          const dim = dimensions[k];
          if (answers[k] === 'a') { if (dim[0]==='E')E++; else if (dim[0]==='S')S++; else if (dim[0]==='T')T++; else if (dim[0]==='J')J++; }
          else { if (dim[1]==='I')I++; else if (dim[1]==='N')N++; else if (dim[1]==='F')F++; else if (dim[1]==='P')P++; }
        });
        const mbtiType = (E >= I ? 'E' : 'I') + (S >= N ? 'S' : 'N') + (T >= F ? 'T' : 'F') + (J >= P ? 'J' : 'P');
        result = { code: mbtiType, ...ASSESSMENT_DATA.mbti.results[mbtiType] || ASSESSMENT_DATA.mbti.results['INTJ'] };
      } else if (type === 'holland') {
        const scores = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
        const dims = ['R','I','A','S','E','C','R','I','A','S','E','C'];
        Object.keys(answers).forEach(k => {
          const score = answers[k] === 'a' ? 5 : answers[k] === 'b' ? 4 : answers[k] === 'c' ? 3 : answers[k] === 'd' ? 2 : 1;
          scores[dims[k]] += score;
        });
        const sorted = Object.entries(scores).sort((a,b) => b[1] - a[1]);
        const top3 = sorted.slice(0, 3).map(s => s[0]);
        const topResult = ASSESSMENT_DATA.holland.results[top3[0]];
        result = { code: top3.join(''), top: top3[0], ...topResult, scores };
      } else if (type === 'disc') {
        const scores = { D: 0, I: 0, S: 0, C: 0 };
        const dims = ['D','I','S','C'];
        Object.keys(answers).forEach(k => {
          const idx = answers[k].charCodeAt(0) - 97;
          scores[dims[idx]]++;
        });
        const sorted = Object.entries(scores).sort((a,b) => b[1] - a[1]);
        result = { code: sorted[0][0], dim: ASSESSMENT_DATA.disc.dimensions[sorted[0][0]], scores };
      } else if (type === 'values') {
        const values = ['薪酬待遇', '工作稳定', '成长发展', '人际和谐', '社会价值', '工作自主', '工作挑战', '生活平衡'];
        const scores = {};
        values.forEach((v, i) => scores[v] = 0);
        Object.keys(answers).forEach(k => {
          const idx = answers[k].charCodeAt(0) - 97;
          scores[values[idx]]++;
        });
        const sorted = Object.entries(scores).sort((a,b) => b[1] - a[1]);
        result = { topValue: sorted[0][0], scores };
      }

      assessmentState.results[type] = result;
      showAssessmentResult(type, result);
      updateAssessmentStatus(type, true);
      renderAssessmentResults();
    }

    function showAssessmentResult(type, result) {
      const modal = document.getElementById('result-modal');
      const data = ASSESSMENT_DATA[type];

      document.getElementById('result-title').textContent = data.title + '完成！';

      let contentHtml = '';

      if (type === 'mbti') {
        contentHtml = `
          <div class="text-center mb-6">
            <div class="text-5xl font-display font-extrabold mb-2" style="color:${data.color}">${result.code}</div>
            <div class="text-xl font-bold text-content-text mb-2">${result.name}</div>
            <div class="text-content-sub">${result.desc}</div>
          </div>
          <div class="mb-5">
            <h5 class="font-semibold text-sm text-content-text mb-3"><i class="fa-solid fa-star text-brand-amber mr-2"></i>你的性格特质</h5>
            <div class="flex flex-wrap gap-2">
              ${result.traits.map(t => '<span class="px-3 py-1.5 rounded-lg text-sm" style="background:' + data.color + '15;color:' + data.color + '">' + t + '</span>').join('')}
            </div>
          </div>
          <div>
            <h5 class="font-semibold text-sm text-content-text mb-3"><i class="fa-solid fa-briefcase text-brand-cyan mr-2"></i>适配岗位方向</h5>
            <div class="grid grid-cols-2 gap-2">
              ${result.jobs.map(j => '<div class="px-3 py-2 rounded-lg bg-gray-50 text-sm text-content-text flex items-center gap-2"><i class="fa-solid fa-check text-state-success text-xs"></i>' + j + '</div>').join('')}
            </div>
          </div>
        `;
      } else if (type === 'holland') {
        contentHtml = `
          <div class="text-center mb-6">
            <div class="text-5xl font-display font-extrabold mb-2" style="color:${data.color}">${result.code}</div>
            <div class="text-xl font-bold text-content-text mb-2">${result.name}</div>
            <div class="text-content-sub">${result.desc}</div>
          </div>
          <div class="mb-5">
            <h5 class="font-semibold text-sm text-content-text mb-3"><i class="fa-solid fa-chart-bar text-brand-cyan mr-2"></i>兴趣维度得分</h5>
            <div class="space-y-2">
              ${Object.entries(result.scores).sort((a,b) => b[1] - a[1]).map(([k,v]) => `
                <div class="flex items-center gap-3">
                  <span class="w-16 text-sm font-medium">${ASSESSMENT_DATA.holland.dimensions[k]}</span>
                  <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full" style="width:${v/6*100}%;background:${k === result.top ? data.color : '#D1D5DB'}"></div>
                  </div>
                  <span class="w-8 text-sm text-right font-medium">${v}</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div>
            <h5 class="font-semibold text-sm text-content-text mb-3"><i class="fa-solid fa-briefcase text-brand-cyan mr-2"></i>适配岗位方向</h5>
            <div class="flex flex-wrap gap-2">
              ${result.jobs.map(j => '<span class="px-3 py-1.5 rounded-lg text-sm bg-gray-50 text-content-text">' + j + '</span>').join('')}
            </div>
          </div>
        `;
      } else if (type === 'disc') {
        const dimNames = { D: '支配型', I: '影响型', S: '稳健型', C: '谨慎型' };
        const dimDescs = {
          D: '你喜欢掌控局面，直接果断，目标导向，善于解决问题和做出决策。',
          I: '你热情乐观，善于交际，有说服力，喜欢与人互动，能带动团队氛围。',
          S: '你耐心温和，善于倾听，是可靠的团队协作者，重视稳定与和谐。',
          C: '你严谨细致，注重事实和数据，追求准确和完美，遵守规则。'
        };
        contentHtml = `
          <div class="text-center mb-6">
            <div class="text-5xl font-display font-extrabold mb-2" style="color:${data.color}">${result.code}</div>
            <div class="text-xl font-bold text-content-text mb-2">${dimNames[result.code]}</div>
            <div class="text-content-sub">${dimDescs[result.code]}</div>
          </div>
          <div class="mb-5">
            <h5 class="font-semibold text-sm text-content-text mb-3"><i class="fa-solid fa-chart-pie text-brand-cyan mr-2"></i>DISC 维度分布</h5>
            <div class="grid grid-cols-4 gap-3">
              ${Object.entries(result.scores).map(([k,v]) => `
                <div class="text-center p-3 rounded-xl ${k === result.code ? 'bg-amber-50 border-2 border-amber-200' : 'bg-gray-50'}">
                  <div class="text-2xl font-display font-bold mb-1" style="color:${k === result.code ? data.color : '#9CA3AF'}">${k}</div>
                  <div class="text-xs text-content-sub mb-1">${dimNames[k]}</div>
                  <div class="text-lg font-semibold">${v}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else if (type === 'values') {
        contentHtml = `
          <div class="text-center mb-6">
            <div class="text-3xl font-display font-bold mb-2" style="color:${data.color}">你最看重：${result.topValue}</div>
            <div class="text-content-sub">这是你在职业选择中最核心的诉求</div>
          </div>
          <div class="mb-5">
            <h5 class="font-semibold text-sm text-content-text mb-3"><i class="fa-solid fa-heart text-state-danger mr-2"></i>价值观优先级</h5>
            <div class="space-y-2">
              ${Object.entries(result.scores).sort((a,b) => b[1] - a[1]).map(([k,v], i) => `
                <div class="flex items-center gap-3">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'}">${i+1}</span>
                  <span class="w-20 text-sm font-medium">${k}</span>
                  <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full" style="width:${v/8*100}%;background:${i === 0 ? data.color : '#D1D5DB'}"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      document.getElementById('result-content').innerHTML = contentHtml;
      openModal('result-modal');
    }

    function updateAssessmentStatus(type, completed) {
      const el = document.getElementById(type + '-status');
      if (!el) return;
      if (completed) {
        el.className = 'status-badge status-done';
        el.textContent = '已完成';
      } else {
        el.className = 'status-badge status-progress';
        el.textContent = '测评中...';
      }
    }

    function renderAssessmentResults() {
      const results = assessmentState.results;
      const hasResults = Object.keys(results).length > 0;
      const container = document.getElementById('assessment-results');
      const resultsContainer = document.getElementById('results-container');

      if (!hasResults) {
        container.classList.add('hidden');
        return;
      }

      container.classList.remove('hidden');

      let html = '';

      if (results.mbti) {
        html += `
          <div class="card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#6D5EF61A">
                <i class="fa-solid fa-user-astronaut" style="color:#6D5EF6"></i>
              </div>
              <div>
                <h4 class="font-display font-bold text-base">MBTI 人格</h4>
                <p class="text-xs text-content-sub">${results.mbti.name}</p>
              </div>
              <div class="ml-auto text-3xl font-display font-extrabold" style="color:#6D5EF6">${results.mbti.code}</div>
            </div>
            <div class="flex flex-wrap gap-1.5">
              ${results.mbti.traits.slice(0,4).map(t => '<span class="px-2 py-1 rounded text-xs bg-purple-50 text-purple-600">' + t + '</span>').join('')}
            </div>
          </div>
        `;
      }

      if (results.holland) {
        html += `
          <div class="card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#0EA5B71A">
                <i class="fa-solid fa-compass" style="color:#0EA5B7"></i>
              </div>
              <div>
                <h4 class="font-display font-bold text-base">霍兰德兴趣</h4>
                <p class="text-xs text-content-sub">${results.holland.name.split(' ')[0]}</p>
              </div>
              <div class="ml-auto text-3xl font-display font-extrabold" style="color:#0EA5B7">${results.holland.code}</div>
            </div>
            <div class="text-sm text-content-sub">
              主导兴趣：${results.holland.name}
            </div>
          </div>
        `;
      }

      if (results.disc) {
        html += `
          <div class="card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#F59E0B1A">
                <i class="fa-solid fa-chart-pie" style="color:#F59E0B"></i>
              </div>
              <div>
                <h4 class="font-display font-bold text-base">DISC 行为风格</h4>
                <p class="text-xs text-content-sub">${results.disc.dim}</p>
              </div>
              <div class="ml-auto text-3xl font-display font-extrabold" style="color:#F59E0B">${results.disc.code}</div>
            </div>
          </div>
        `;
      }

      if (results.values) {
        html += `
          <div class="card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#10B9811A">
                <i class="fa-solid fa-heart" style="color:#10B981"></i>
              </div>
              <div>
                <h4 class="font-display font-bold text-base">职业价值观</h4>
                <p class="text-xs text-content-sub">核心诉求</p>
              </div>
            </div>
            <div class="text-lg font-semibold" style="color:#10B981">${results.values.topValue}</div>
          </div>
        `;
      }

      resultsContainer.innerHTML = html;
    }

    function closeAssessmentModal() {
      closeModal('assessment-modal');
      assessmentState.current = null;
    }

    function closeResultModal() {
      closeModal('result-modal');
    }

    function viewFullReport() {
      const results = assessmentState.results;
      const traits = interviewState.traits;
      const hasAnyAssessment = Object.keys(results).length > 0 || Object.values(traits).some(v => v);

      if (!hasAnyAssessment) {
        showToast('请先完成至少一项测评或AI访谈', 'info');
        return;
      }

      document.getElementById('profile-report-avatar').src = currentAccount.avatar;
      document.getElementById('profile-report-name').textContent = currentAccount.name + ' 的职业画像';

      let reportHtml = '';

      // 1. 人格特质概览
      reportHtml += `
        <div class="mb-8">
          <h4 class="font-display font-bold text-lg text-content-text mb-4 flex items-center gap-2">
            <i class="fa-solid fa-id-badge text-brand-purple"></i>人格特质概览
          </h4>
          <div class="grid grid-cols-4 gap-4">
      `;

      const mbti = results.mbti;
      const holland = results.holland;
      const disc = results.disc;
      const values = results.values;

      // MBTI Card
      if (mbti) {
        reportHtml += `
          <div class="text-center p-4 rounded-xl" style="background:linear-gradient(135deg,#6D5EF615,#8B7FF810);border:1px solid #6D5EF630">
            <div class="text-xs text-content-sub mb-1">MBTI 人格类型</div>
            <div class="text-3xl font-display font-extrabold mb-1" style="color:#6D5EF6">${mbti.code}</div>
            <div class="text-sm font-semibold text-content-text">${mbti.name}</div>
          </div>
        `;
      } else {
        reportHtml += `
          <div class="text-center p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200">
            <div class="text-xs text-content-sub mb-1">MBTI 人格类型</div>
            <div class="text-gray-400 text-2xl">--</div>
            <div class="text-xs text-gray-400">未测评</div>
          </div>
        `;
      }

      // Holland Card
      if (holland) {
        reportHtml += `
          <div class="text-center p-4 rounded-xl" style="background:linear-gradient(135deg,#0EA5B715,#38BDF810);border:1px solid #0EA5B730">
            <div class="text-xs text-content-sub mb-1">霍兰德兴趣代码</div>
            <div class="text-3xl font-display font-extrabold mb-1" style="color:#0EA5B7">${holland.code}</div>
            <div class="text-sm font-semibold text-content-text">${holland.name.split(' ')[0]}</div>
          </div>
        `;
      } else {
        reportHtml += `
          <div class="text-center p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200">
            <div class="text-xs text-content-sub mb-1">霍兰德兴趣代码</div>
            <div class="text-gray-400 text-2xl">--</div>
            <div class="text-xs text-gray-400">未测评</div>
          </div>
        `;
      }

      // DISC Card
      if (disc) {
        reportHtml += `
          <div class="text-center p-4 rounded-xl" style="background:linear-gradient(135deg,#F59E0B15,#FBBF2410);border:1px solid #F59E0B30">
            <div class="text-xs text-content-sub mb-1">DISC 行为风格</div>
            <div class="text-3xl font-display font-extrabold mb-1" style="color:#F59E0B">${disc.code}</div>
            <div class="text-sm font-semibold text-content-text">${disc.dim}</div>
          </div>
        `;
      } else {
        reportHtml += `
          <div class="text-center p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200">
            <div class="text-xs text-content-sub mb-1">DISC 行为风格</div>
            <div class="text-gray-400 text-2xl">--</div>
            <div class="text-xs text-gray-400">未测评</div>
          </div>
        `;
      }

      // Values Card
      if (values) {
        reportHtml += `
          <div class="text-center p-4 rounded-xl" style="background:linear-gradient(135deg,#10B98115,#34D39910);border:1px solid #10B98130">
            <div class="text-xs text-content-sub mb-1">核心职业价值观</div>
            <div class="text-xl font-display font-extrabold mb-1" style="color:#10B981">${values.topValue}</div>
            <div class="text-sm font-semibold text-content-text">最看重的因素</div>
          </div>
        `;
      } else {
        reportHtml += `
          <div class="text-center p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200">
            <div class="text-xs text-content-sub mb-1">核心职业价值观</div>
            <div class="text-gray-400 text-2xl">--</div>
            <div class="text-xs text-gray-400">未测评</div>
          </div>
        `;
      }

      reportHtml += `</div></div>`;

      // 2. 性格特质详细解读
      if (mbti) {
        reportHtml += `
          <div class="mb-8">
            <h4 class="font-display font-bold text-lg text-content-text mb-4 flex items-center gap-2">
              <i class="fa-solid fa-star text-state-warning"></i>性格特质解读
            </h4>
            <div class="p-5 rounded-2xl" style="background:#FAF8FE;border:1px solid #6D5EF620">
              <div class="flex items-start gap-4 mb-4">
                <div class="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#6D5EF6,#8B7FF8)">
                  <span class="text-white font-display font-bold text-xl">${mbti.code}</span>
                </div>
                <div>
                  <div class="font-bold text-lg text-content-text mb-1">${mbti.name}型人格</div>
                  <div class="text-content-sub">${mbti.desc}</div>
                </div>
              </div>
              <div class="flex flex-wrap gap-2 mb-4">
                ${mbti.traits.map(t => `<span class="px-3 py-1.5 rounded-lg text-sm font-medium" style="background:#6D5EF615;color:#6D5EF6">${t}</span>`).join('')}
              </div>
              <div class="text-sm text-content-text leading-relaxed">
                <strong class="text-content-text">💡 性格优势：</strong>你在团队中通常表现出${mbti.traits.slice(0,2).join('、')}的特质，这让你在处理${mbti.code.includes('N') ? '创意和规划类' : '执行和细节类'}工作时具有天然优势。
              </div>
            </div>
          </div>
        `;
      }

      // 3. 霍兰德兴趣详细分析
      if (holland && holland.scores) {
        const dimNames = { R: '现实型', I: '研究型', A: '艺术型', S: '社会型', E: '企业型', C: '常规型' };
        const dimColors = { R: '#F59E0B', I: '#6D5EF6', A: '#EC4899', S: '#10B981', E: '#EF4444', C: '#0EA5B7' };
        const maxScore = Math.max(...Object.values(holland.scores));
        reportHtml += `
          <div class="mb-8">
            <h4 class="font-display font-bold text-lg text-content-text mb-4 flex items-center gap-2">
              <i class="fa-solid fa-compass text-brand-cyan"></i>职业兴趣倾向
            </h4>
            <div class="grid grid-cols-2 gap-x-8 gap-y-3">
              ${Object.entries(holland.scores).sort((a,b) => b[1] - a[1]).map(([k,v]) => `
                <div class="flex items-center gap-3">
                  <span class="w-16 text-sm font-medium ${k === holland.top ? 'text-brand-cyan font-bold' : 'text-content-text'}">${dimNames[k]}</span>
                  <div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all" style="width:${v/maxScore*100}%;background:${dimColors[k]}"></div>
                  </div>
                  <span class="w-8 text-sm text-right font-medium ${k === holland.top ? 'text-brand-cyan' : 'text-content-sub'}">${v}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      // 4. AI访谈洞察
      const hasInterview = Object.values(traits).some(v => v);
      if (hasInterview) {
        reportHtml += `
          <div class="mb-8">
            <h4 class="font-display font-bold text-lg text-content-text mb-4 flex items-center gap-2">
              <i class="fa-solid fa-robot" style="color:linear-gradient(135deg,#6D5EF6,#0EA5B7)"></i>AI 深度访谈洞察
            </h4>
            <div class="p-5 rounded-2xl" style="background:linear-gradient(135deg,rgba(109,94,246,0.05),rgba(14,165,183,0.03));border:1px solid rgba(109,94,246,0.15)">
              <div class="grid grid-cols-2 gap-4">
                ${traits.workStyle ? `
                <div class="bg-white rounded-xl p-4">
                  <div class="text-xs text-content-sub mb-1"><i class="fa-solid fa-bolt text-brand-purple mr-1"></i>工作风格</div>
                  <div class="text-sm font-medium text-content-text">${traits.workStyle}</div>
                </div>` : ''}
                ${traits.teamStyle ? `
                <div class="bg-white rounded-xl p-4">
                  <div class="text-xs text-content-sub mb-1"><i class="fa-solid fa-users text-brand-cyan mr-1"></i>团队角色</div>
                  <div class="text-sm font-medium text-content-text">${traits.teamStyle}</div>
                </div>` : ''}
                ${traits.pressureResponse ? `
                <div class="bg-white rounded-xl p-4">
                  <div class="text-xs text-content-sub mb-1"><i class="fa-solid fa-fire text-state-warning mr-1"></i>压力应对</div>
                  <div class="text-sm font-medium text-content-text">${traits.pressureResponse}</div>
                </div>` : ''}
                ${traits.motivation ? `
                <div class="bg-white rounded-xl p-4">
                  <div class="text-xs text-content-sub mb-1"><i class="fa-solid fa-heart text-state-danger mr-1"></i>核心驱动力</div>
                  <div class="text-sm font-medium text-content-text">${traits.motivation}</div>
                </div>` : ''}
                ${traits.decisionStyle ? `
                <div class="bg-white rounded-xl p-4">
                  <div class="text-xs text-content-sub mb-1"><i class="fa-solid fa-scale-balanced text-emerald-500 mr-1"></i>决策风格</div>
                  <div class="text-sm font-medium text-content-text">${traits.decisionStyle}</div>
                </div>` : ''}
                ${traits.careerGoal ? `
                <div class="bg-white rounded-xl p-4">
                  <div class="text-xs text-content-sub mb-1"><i class="fa-solid fa-bullseye text-brand-purple mr-1"></i>职业目标</div>
                  <div class="text-sm font-medium text-content-text">${traits.careerGoal}</div>
                </div>` : ''}
              </div>
            </div>
          </div>
        `;
      }

      // 5. 适配岗位推荐
      let recommendedJobs = [];
      if (mbti) recommendedJobs = recommendedJobs.concat(mbti.jobs || []);
      if (holland) recommendedJobs = recommendedJobs.concat(holland.jobs || []);
      recommendedJobs = [...new Set(recommendedJobs)].slice(0, 8);

      if (recommendedJobs.length > 0) {
        reportHtml += `
          <div class="mb-8">
            <h4 class="font-display font-bold text-lg text-content-text mb-4 flex items-center gap-2">
              <i class="fa-solid fa-briefcase text-state-success"></i>适配岗位推荐
            </h4>
            <div class="grid grid-cols-4 gap-3">
              ${recommendedJobs.map(job => `
                <div class="p-3 rounded-xl border border-gray-100 bg-gray-50 hover:border-brand-purple/30 hover:bg-purple-50/30 transition text-center">
                  <i class="fa-solid fa-circle-check text-state-success text-sm mb-1.5"></i>
                  <div class="text-sm font-medium text-content-text">${job}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      // 6. 职业发展建议
      reportHtml += `
        <div>
          <h4 class="font-display font-bold text-lg text-content-text mb-4 flex items-center gap-2">
            <i class="fa-solid fa-lightbulb text-state-warning"></i>职业发展建议
          </h4>
          <div class="space-y-3">
            <div class="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
              <i class="fa-solid fa-arrow-trend-up text-blue-500 mt-0.5"></i>
              <div>
                <div class="font-semibold text-sm text-blue-800 mb-1">发挥优势</div>
                <div class="text-sm text-blue-700">${mbti ? '利用你' + mbti.traits[0] + '的特质，在' + (mbti.jobs ? mbti.jobs[0] : '适合') + '类岗位上更容易获得成就感。' : '完成更多测评可以获得个性化建议。'}</div>
              </div>
            </div>
            <div class="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
              <i class="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5"></i>
              <div>
                <div class="font-semibold text-sm text-amber-800 mb-1">注意盲区</div>
                <div class="text-sm text-amber-700">${disc ? (disc.code === 'D' ? '注意倾听团队成员意见，避免过于强势。' : disc.code === 'I' ? '关注细节和执行力，避免过度乐观。' : disc.code === 'S' ? '适当主动表达，避免一味妥协。' : '提升决策效率，避免过度追求完美。') : '完成 DISC 测评可以了解行为盲区。'}</div>
              </div>
            </div>
            <div class="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <i class="fa-solid fa-route text-emerald-500 mt-0.5"></i>
              <div>
                <div class="font-semibold text-sm text-emerald-800 mb-1">发展路径</div>
                <div class="text-sm text-emerald-700">${traits.careerGoal ? '基于你"' + traits.careerGoal + '"的职业目标，建议优先夯实核心技能，积累相关项目经验。' : '明确职业目标后可以获得定制化发展路径。'}</div>
              </div>
            </div>
          </div>
        </div>
      `;

      document.getElementById('profile-report-content').innerHTML = reportHtml;
      openModal('profile-report-modal');
    }

    function closeProfileReport() {
      closeModal('profile-report-modal');
    }

    // ============ AI INTERVIEW ============
    function startAIInterview() {
      interviewState.step = 0;
      interviewState.messages = [];
      Object.keys(interviewState.traits).forEach(k => interviewState.traits[k] = null);

      document.getElementById('chat-messages').innerHTML = '';
      document.getElementById('quick-replies').innerHTML = '';
      document.getElementById('interview-progress').textContent = '访谈进度：0%';

      openModal('ai-interview-modal');

      setTimeout(() => {
        addAIMessage(INTERVIEW_QUESTIONS[0].ai);
        renderQuickReplies(INTERVIEW_QUESTIONS[0].quickReplies);
      }, 500);
    }

    function addAIMessage(text) {
      const container = document.getElementById('chat-messages');
      const msgHtml = `
        <div class="flex gap-3 animate-fadeIn">
          <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center" style="background:linear-gradient(135deg,#6D5EF6,#0EA5B7)">
            <i class="fa-solid fa-robot text-white text-xs"></i>
          </div>
          <div class="flex-1">
            <div class="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100">
              <p class="text-sm text-content-text leading-relaxed">${text}</p>
            </div>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', msgHtml);
      container.scrollTop = container.scrollHeight;
    }

    function addUserMessage(text) {
      const container = document.getElementById('chat-messages');
      const msgHtml = `
        <div class="flex gap-3 justify-end animate-fadeIn">
          <div class="max-w-[80%]">
            <div class="rounded-2xl rounded-tr-sm px-4 py-3 text-white" style="background:linear-gradient(135deg,#6D5EF6,#8B7FF8)">
              <p class="text-sm leading-relaxed">${text}</p>
            </div>
          </div>
          <img src="${currentAccount.avatar}" class="w-8 h-8 rounded-full flex-shrink-0" alt="" />
        </div>
      `;
      container.insertAdjacentHTML('beforeend', msgHtml);
      container.scrollTop = container.scrollHeight;
    }

    function renderQuickReplies(replies) {
      const container = document.getElementById('quick-replies');
      container.innerHTML = replies.map(r =>
        `<button class="px-3 py-1.5 rounded-full text-xs border border-gray-200 hover:border-brand-purple hover:text-brand-purple transition bg-white" onclick="selectQuickReply('${r.replace(/'/g, "\\'")}')">${r}</button>`
      ).join('');
    }

    function selectQuickReply(text) {
      sendChatMessage(text);
    }

    function sendChatMessage(customText) {
      const input = document.getElementById('chat-input');
      const text = customText || input.value.trim();
      if (!text) return;

      addUserMessage(text);
      input.value = '';
      document.getElementById('quick-replies').innerHTML = '';

      const currentQ = INTERVIEW_QUESTIONS[interviewState.step];
      if (currentQ) {
        interviewState.traits[currentQ.trait] = text;
      }

      interviewState.step++;
      const progress = Math.min(Math.round(interviewState.step / INTERVIEW_QUESTIONS.length * 100), 100);
      document.getElementById('interview-progress').textContent = '访谈进度：' + progress + '%';

      if (interviewState.step < INTERVIEW_QUESTIONS.length) {
        setTimeout(() => {
          const nextQ = INTERVIEW_QUESTIONS[interviewState.step];
          addAIMessage(nextQ.ai);
          renderQuickReplies(nextQ.quickReplies);
        }, 800 + Math.random() * 500);
      } else {
        setTimeout(() => {
          addAIMessage('太棒了！我已经充分了解你的特质啦~ 让我为你生成专属的职业画像分析...');
          setTimeout(() => {
            closeModal('ai-interview-modal');
            generateInterviewReport();
          }, 2000);
        }, 800);
      }
    }

    function handleChatKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    }

    function generateInterviewReport() {
      const traits = interviewState.traits;
      const summary = `
        <div class="text-center mb-6">
          <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style="background:linear-gradient(135deg,#6D5EF6,#0EA5B7)">
            <i class="fa-solid fa-user-check text-white text-3xl"></i>
          </div>
          <div class="text-2xl font-display font-bold mb-2">AI 访谈完成！</div>
          <div class="text-content-sub">你的职业画像分析报告已生成</div>
        </div>
        <div class="space-y-4">
          <div class="p-4 rounded-xl bg-purple-50">
            <h5 class="font-semibold text-sm text-purple-700 mb-2"><i class="fa-solid fa-bolt mr-1.5"></i>工作风格</h5>
            <p class="text-sm text-gray-700">${traits.workStyle || '待补充'}</p>
          </div>
          <div class="p-4 rounded-xl bg-cyan-50">
            <h5 class="font-semibold text-sm text-cyan-700 mb-2"><i class="fa-solid fa-users mr-1.5"></i>团队角色</h5>
            <p class="text-sm text-gray-700">${traits.teamStyle || '待补充'}</p>
          </div>
          <div class="p-4 rounded-xl bg-amber-50">
            <h5 class="font-semibold text-sm text-amber-700 mb-2"><i class="fa-solid fa-fire mr-1.5"></i>核心驱动力</h5>
            <p class="text-sm text-gray-700">${traits.motivation || '待补充'}</p>
          </div>
          <div class="p-4 rounded-xl bg-emerald-50">
            <h5 class="font-semibold text-sm text-emerald-700 mb-2"><i class="fa-solid fa-bullseye mr-1.5"></i>职业目标</h5>
            <p class="text-sm text-gray-700">${traits.careerGoal || '待补充'}</p>
          </div>
        </div>
        <div class="mt-5 p-4 rounded-xl text-center" style="background:linear-gradient(135deg,rgba(109,94,246,0.08),rgba(14,165,183,0.05))">
          <p class="text-sm text-content-text mb-3">AI 将综合你的测评结果和访谈信息，优化岗位推荐算法</p>
          <button class="btn-primary px-5 py-2 rounded-lg text-sm" onclick="closeResultModal(); switchPage('assessment'); renderAssessmentResults(); updateJobMatchScores()">
            <i class="fa-solid fa-sync mr-1.5"></i>更新岗位匹配度
          </button>
        </div>
      `;

      document.getElementById('result-title').textContent = 'AI 深度访谈完成！';
      document.getElementById('result-content').innerHTML = summary;
      openModal('result-modal');

      showToast('职业画像已更新，岗位推荐将更加精准', 'check');
    }

    function updateJobMatchScores() {
      showToast('岗位匹配算法已根据你的测评结果优化', 'check');
    }

    function closeAIInterview() {
      if (interviewState.step > 0 && interviewState.step < INTERVIEW_QUESTIONS.length) {
        if (confirm('访谈还没完成，确定要退出吗？进度将不会保存。')) {
          closeModal('ai-interview-modal');
        }
      } else {
        closeModal('ai-interview-modal');
      }
    }

    // Add assessment option styles dynamically
    const style = document.createElement('style');
    style.textContent = `
      .assessment-option {
        display: flex;
        align-items: center;
        padding: 14px 16px;
        border: 1.5px solid #E8E8EC;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .assessment-option:hover {
        border-color: rgba(109,94,246,0.4);
        background: rgba(109,94,246,0.03);
      }
      .assessment-option.selected {
        border-color: #6D5EF6;
        background: rgba(109,94,246,0.06);
      }
      .animate-fadeIn {
        animation: fadeIn 0.3s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);

    // ============ NOTIFICATIONS ============
    function openNotifications() { openModal('notif-modal'); }
    function markAllRead() {
      closeModal('notif-modal');
      showToast('已全部标为已读', 'check');
    }

    // ============ HELP ============
    function openHelp() { openModal('help-modal'); }

    // ============ SEARCH ============
    function handleSearch() {
      const q = (document.getElementById('global-search').value || '').trim();
      if (!q) { showToast('请输入搜索关键词', 'info'); return; }
      // Simple demo routing
      const map = [
        { kw: ['前端','react','javascript','typescript','vue'], page: 'tasks' },
        { kw: ['简历','理想'], page: 'resume' },
        { kw: ['诊断','技能','差距','雷达'], page: 'diagnosis' },
        { kw: ['规划','职业','岗位'], page: 'planning' },
        { kw: ['任务','提交','成果'], page: 'tasks' },
        { kw: ['个人','信息','账号','设置'], page: 'profile' },
        { kw: ['工作台','首页','dashboard'], page: 'dashboard' },
      ];
      const lower = q.toLowerCase();
      const match = map.find(m => m.kw.some(k => lower.includes(k.toLowerCase())));
      if (match) {
        switchPage(match.page);
        showToast('已跳转到「' + PAGE_LABELS[match.page] + '」', 'check');
      } else {
        showToast('未找到与「' + q + '」相关的内容，请尝试其他关键词', 'info');
      }
    }

    // ============ TASK DETAIL ============
    const TASK_DETAILS = {
      'react-hooks': {
        title: 'React Hooks 实战项目',
        icon: 'fa-code',
        color: 'rgba(14,165,183,0.1)',
        iconColor: 'text-brand-cyan',
        type: 'A',
        sections: [
          { label: '任务描述', text: '使用 useState / useEffect / useMemo 实现 TodoList，需含过滤与本地存储。' },
          { label: '关联技能', text: 'React 框架与 Hooks' },
          { label: '预计时长', text: '4 小时' },
          { label: '成果物要求', text: '可运行代码仓库（GitHub / Gitee），README 含运行说明' },
          { label: '验收标准', text: '1) 增删改查功能完整；2) 使用 Hooks 而非 class 组件；3) 本地存储持久化；4) 过滤功能（全部/未完成/已完成）' },
          { label: '参考资源', text: 'React 官方文档 · Hooks FAQ · TodoMVC 示例' },
        ],
        keyPoints: ['Hooks 依赖数组', 'useEffect 清理函数', 'useMemo 性能优化边界', '状态提升与组合'],
        references: [
          { title: 'React 官方文档 - Hooks 简介', url: 'https://react.dev/reference/react' },
          { title: 'TodoMVC 经典实现', url: 'https://todomvc.com/' },
          { title: 'useEffect 完整指南', url: 'https://overreacted.io/zh-hans/a-complete-guide-to-useeffect/' }
        ],
        rubric: [
          { level: '优秀 (90-100)', desc: 'Hooks 使用规范、依赖数组完整、含性能优化、代码可读性高', score: '90-100' },
          { level: '良好 (75-89)', desc: '功能完整但缺少性能优化或部分依赖遗漏', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本功能可用但存在明显 Hooks 误用', score: '60-74' },
          { level: '不合格 (<60)', desc: '功能缺失或使用 class 组件', score: '<60' }
        ]
      },
      'typescript': {
        title: 'TypeScript 类型实战',
        icon: 'fa-hourglass-half',
        color: 'rgba(245,158,11,0.1)',
        iconColor: 'text-state-warning',
        type: 'A',
        sections: [
          { label: '任务描述', text: '为已有 React 项目补充 TypeScript 类型定义，覆盖 props、state 与 API 响应。' },
          { label: '关联技能', text: 'TypeScript 类型系统' },
          { label: '预计时长', text: '6 小时' },
          { label: '当前状态', text: 'AI 正在评估成果物（约 30s），请耐心等待' },
          { label: '验收标准', text: '1) 所有组件 props 有 interface 定义；2) API 响应有类型；3) tsconfig 严格模式无报错；4) 无 any 类型' },
        ],
        keyPoints: ['interface 与 type 选择', '泛型组件封装', 'API 响应类型推断', 'tsconfig strict 模式'],
        references: [
          { title: 'TypeScript 官方手册', url: 'https://www.typescriptlang.org/zh/docs/handbook/intro.html' },
          { title: 'React + TypeScript Cheatsheets', url: 'https://react-typescript-cheatsheet.netlify.app/' },
          { title: 'tsconfig 严格模式详解', url: 'https://www.typescriptlang.org/tsconfig' }
        ],
        rubric: [
          { level: '优秀 (90-100)', desc: '类型完整、含泛型抽象、strict 模式无报错、无 any', score: '90-100' },
          { level: '良好 (75-89)', desc: '主要类型完整但少量 any 或缺少泛型', score: '75-89' },
          { level: '合格 (60-74)', desc: 'props 有类型但 API 响应未定义、strict 未开启', score: '60-74' },
          { level: '不合格 (<60)', desc: '大量 any 或类型缺失', score: '<60' }
        ]
      },
      'review': {
        title: '撰写项目复盘总结',
        icon: 'fa-pen-nib',
        color: 'rgba(15,12,41,0.06)',
        iconColor: 'text-content-sub',
        type: 'B',
        sections: [
          { label: '任务描述', text: '复盘近期完成的项目，输出 ≥500 字心得，重点描述技术决策与踩坑经验。' },
          { label: '关联技能', text: '软技能 / 表达' },
          { label: '预计时长', text: '2 小时' },
          { label: '成果物要求', text: '复盘报告文本（Markdown / 纯文本均可）' },
          { label: '验收标准', text: '1) 字数 ≥500；2) 包含技术决策说明；3) 描述至少 2 个踩坑经验；4) 含改进方向' },
        ],
        keyPoints: ['STAR 结构（情境-任务-行动-结果）', '技术决策 trade-off 说明', '踩坑根因分析', '可量化的产出描述'],
        references: [
          { title: '如何写好技术复盘', url: 'https://github.com/awesome-tips/awesome-tips' },
          { title: 'STAR 法则详解', url: 'https://zh.wikipedia.org/wiki/STAR%E9%9D%A2%E8%AF%95%E6%B3%95' }
        ],
        rubric: [
          { level: '优秀 (90-100)', desc: '结构清晰、含数据支撑、有深度反思与可执行改进', score: '90-100' },
          { level: '良好 (75-89)', desc: '内容完整但缺少量化或改进方向模糊', score: '75-89' },
          { level: '合格 (60-74)', desc: '字数达标但流水账、缺技术决策说明', score: '60-74' },
          { level: '不合格 (<60)', desc: '字数不足或与项目无关', score: '<60' }
        ]
      },
      'vite': {
        title: 'Vite 构建配置实战',
        icon: 'fa-rotate-left',
        color: 'rgba(244,63,94,0.1)',
        iconColor: 'text-state-danger',
        type: 'A',
        sections: [
          { label: '任务描述', text: '配置 Vite 多环境构建，含 alias、代理、压缩。上次提交缺少环境变量处理，请补充后重新提交。' },
          { label: '关联技能', text: 'Webpack / Vite 构建工具' },
          { label: '预计时长', text: '5 小时' },
          { label: 'AI 反馈', text: 'vite.config.ts 中 process.env 未做类型声明，建议使用 import.meta.env 并补充 env.d.ts。' },
          { label: '验收标准', text: '1) 多环境 .env 文件；2) alias 配置；3) 代理配置；4) 构建压缩；5) 类型声明完整' },
        ],
        keyPoints: ['import.meta.env 类型声明', '多环境 .env 文件命名约定', 'alias 路径映射', 'proxy 跨域配置'],
        references: [
          { title: 'Vite 官方文档 - 配置', url: 'https://cn.vitejs.dev/config/' },
          { title: '环境变量与模式', url: 'https://cn.vitejs.dev/guide/env-and-mode.html' },
          { title: 'Vite 部署优化实践', url: 'https://cn.vitejs.dev/guide/build.html' }
        ],
        rubric: [
          { level: '优秀 (90-100)', desc: '五项全部满足、含构建产物分析与优化', score: '90-100' },
          { level: '良好 (75-89)', desc: '四项满足、缺少构建压缩或类型声明', score: '75-89' },
          { level: '合格 (60-74)', desc: '三项满足、env 处理不规范', score: '60-74' },
          { level: '不合格 (<60)', desc: '配置缺失或无法构建', score: '<60' }
        ]
      },
      'spring-boot': {
        title: 'Spring Boot 入门项目', icon: 'fa-server', color: 'rgba(16,185,129,0.1)', iconColor: 'text-state-success', type: 'A',
        sections: [
          { label: '任务描述', text: '使用 Spring Boot 搭建 RESTful API 服务，实现基本的 CRUD 操作。' },
          { label: '关联技能', text: 'Java / Spring Boot / Maven' },
          { label: '预计时长', text: '6 小时' },
          { label: '验收标准', text: '1) pom.xml 依赖完整；2) Controller/Service/Repository 分层清晰；3) 接口文档齐全；4) 可通过 curl/Postman 测试' },
        ],
        keyPoints: ['Spring Boot 自动配置', '依赖注入', 'JPA 数据持久化', 'RESTful 设计规范'],
        references: [
          { title: 'Spring Boot 官方文档', url: 'https://docs.spring.io/spring-boot/docs/current/reference/html/' }
        ],
        rubric: [
          { level: '优秀 (90-100)', desc: '分层清晰、含异常处理和单元测试', score: '90-100' },
          { level: '良好 (75-89)', desc: '功能完整但缺少测试', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本 CRUD 可用', score: '60-74' },
          { level: '不合格 (<60)', desc: '项目无法启动或接口不可用', score: '<60' }
        ]
      },
      'mysql-index': {
        title: 'MySQL 索引优化实战', icon: 'fa-database', color: 'rgba(16,185,129,0.1)', iconColor: 'text-state-success', type: 'A',
        sections: [
          { label: '任务描述', text: '为给定的慢查询 SQL 设计最优索引方案，并使用 EXPLAIN 分析执行计划。' },
          { label: '关联技能', text: 'MySQL 索引优化 / SQL 调优' },
          { label: '预计时长', text: '4 小时' },
          { label: '验收标准', text: '1) 索引设计合理；2) EXPLAIN 结果显示走索引；3) 查询耗时下降明显' },
        ],
        keyPoints: ['B+Tree 索引原理', '最左前缀原则', '覆盖索引', '索引失效场景'],
        references: [
          { title: 'MySQL 索引优化', url: 'https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html' }
        ],
        rubric: [
          { level: '优秀 (90-100)', desc: '多种方案对比、含性能测试数据', score: '90-100' },
          { level: '良好 (75-89)', desc: '索引设计合理', score: '75-89' },
          { level: '合格 (60-74)', desc: '有索引但非最优', score: '60-74' },
          { level: '不合格 (<60)', desc: '未使用索引', score: '<60' }
        ]
      },
      'rest-api': {
        title: 'RESTful API 设计', icon: 'fa-plug', color: 'rgba(16,185,129,0.1)', iconColor: 'text-state-success', type: 'A',
        sections: [
          { label: '任务描述', text: '设计一套完整的 RESTful API，含资源路由、状态码、分页和错误处理规范。' },
          { label: '关联技能', text: 'API 设计 / HTTP 协议' },
          { label: '预计时长', text: '3 小时' },
          { label: '验收标准', text: '1) 资源命名规范；2) HTTP 方法使用正确；3) 状态码语义清晰；4) 含 API 文档' },
        ],
        keyPoints: ['资源命名', 'HTTP 方法语义', 'HATEOAS', '版本控制'],
        rubric: [
          { level: '优秀 (90-100)', desc: '完整 API 设计文档含示例', score: '90-100' },
          { level: '良好 (75-89)', desc: '基本规范正确', score: '75-89' },
          { level: '合格 (60-74)', desc: '有设计但不够规范', score: '60-74' },
          { level: '不合格 (<60)', desc: '不符合 REST 规范', score: '<60' }
        ]
      },
      'python-data': {
        title: 'Python 数据分析基础', icon: 'fa-chart-line', color: 'rgba(245,158,11,0.1)', iconColor: 'text-state-warning', type: 'A',
        sections: [
          { label: '任务描述', text: '使用 Pandas 对给定数据集进行清洗、统计分析和可视化。' },
          { label: '关联技能', text: 'Python / Pandas / 数据可视化' },
          { label: '预计时长', text: '4 小时' },
          { label: '验收标准', text: '1) 数据清洗完整；2) 统计分析合理；3) 图表清晰有洞察' },
        ],
        keyPoints: ['数据清洗', '分组聚合', '可视化', '结论输出'],
        rubric: [
          { level: '优秀 (90-100)', desc: '含深度洞察和建议', score: '90-100' },
          { level: '良好 (75-89)', desc: '分析完整', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本分析完成', score: '60-74' },
          { level: '不合格 (<60)', desc: '数据处理有误', score: '<60' }
        ]
      },
      'ml-intro': {
        title: '机器学习入门项目', icon: 'fa-robot', color: 'rgba(245,158,11,0.1)', iconColor: 'text-state-warning', type: 'A',
        sections: [
          { label: '任务描述', text: '使用 scikit-learn 完成一个分类或回归任务，含数据预处理、模型训练和评估。' },
          { label: '关联技能', text: 'scikit-learn / 模型评估' },
          { label: '预计时长', text: '6 小时' },
          { label: '验收标准', text: '1) 数据管道完整；2) 模型选择合理；3) 评估指标充分' },
        ],
        keyPoints: ['数据预处理', '交叉验证', '超参数调优', '模型评估'],
        rubric: [
          { level: '优秀 (90-100)', desc: '完整 pipeline 含对比实验', score: '90-100' },
          { level: '良好 (75-89)', desc: '模型可用', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本跑通', score: '60-74' },
          { level: '不合格 (<60)', desc: '代码有误', score: '<60' }
        ]
      },
      'pytorch-nn': {
        title: 'PyTorch 神经网络实践', icon: 'fa-brain', color: 'rgba(245,158,11,0.1)', iconColor: 'text-state-warning', type: 'A',
        sections: [
          { label: '任务描述', text: '使用 PyTorch 实现一个图像分类神经网络，含数据加载、模型定义和训练循环。' },
          { label: '关联技能', text: 'PyTorch / 深度学习' },
          { label: '预计时长', text: '6 小时' },
          { label: '验收标准', text: '1) Dataset/DataLoader 正确；2) 模型结构合理；3) 训练过程可视化' },
        ],
        keyPoints: ['Tensor 操作', '自动微分', 'DataLoader', '训练循环'],
        rubric: [
          { level: '优秀 (90-100)', desc: '含完整训练报告', score: '90-100' },
          { level: '良好 (75-89)', desc: '模型可训练', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本框架正确', score: '60-74' },
          { level: '不合格 (<60)', desc: '无法训练', score: '<60' }
        ]
      },
      'figma-components': {
        title: 'Figma 组件库搭建', icon: 'fa-pen-ruler', color: 'rgba(236,72,153,0.1)', iconColor: 'text-pink-500', type: 'A',
        sections: [
          { label: '任务描述', text: '在 Figma 中搭建一套基础 UI 组件库，含按钮、输入框、卡片等。' },
          { label: '关联技能', text: 'Figma / 组件设计 / 设计系统' },
          { label: '预计时长', text: '4 小时' },
          { label: '验收标准', text: '1) 组件变体完整；2) 命名规范；3) 含使用说明' },
        ],
        keyPoints: ['组件变体', 'Auto Layout', '设计 Token', '命名规范'],
        rubric: [
          { level: '优秀 (90-100)', desc: '组件完整规范', score: '90-100' },
          { level: '良好 (75-89)', desc: '基本组件齐全', score: '75-89' },
          { level: '合格 (60-74)', desc: '有组件但不完善', score: '60-74' },
          { level: '不合格 (<60)', desc: '组件缺失', score: '<60' }
        ]
      },
      'ux-report': {
        title: '用户调研报告撰写', icon: 'fa-file-alt', color: 'rgba(236,72,153,0.1)', iconColor: 'text-pink-500', type: 'B',
        sections: [
          { label: '任务描述', text: '基于用户访谈撰写一份完整的 UX 调研报告，含用户画像、痛点分析和改进建议。' },
          { label: '关联技能', text: '用户研究 / 报告撰写' },
          { label: '预计时长', text: '3 小时' },
          { label: '验收标准', text: '1) 结构清晰；2) 数据支撑；3) 建议可行' },
        ],
        keyPoints: ['用户画像', '痛点挖掘', '机会点', '优先级排序'],
        rubric: [
          { level: '优秀 (90-100)', desc: '报告专业、有数据支撑', score: '90-100' },
          { level: '良好 (75-89)', desc: '结构完整', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本框架有', score: '60-74' },
          { level: '不合格 (<60)', desc: '内容空洞', score: '<60' }
        ]
      },
      'mobile-prototype': {
        title: '移动端交互原型设计', icon: 'fa-mobile-screen', color: 'rgba(236,72,153,0.1)', iconColor: 'text-pink-500', type: 'A',
        sections: [
          { label: '任务描述', text: '为 App 核心流程设计高保真交互原型，含页面跳转、过渡动画和微交互。' },
          { label: '关联技能', text: '交互设计 / 原型工具' },
          { label: '预计时长', text: '5 小时' },
          { label: '验收标准', text: '1) 流程完整；2) 交互流畅；3) 视觉统一' },
        ],
        keyPoints: ['信息架构', '交互流程', '动效规范', '可用性'],
        rubric: [
          { level: '优秀 (90-100)', desc: '交互流畅、细节到位', score: '90-100' },
          { level: '良好 (75-89)', desc: '原型可演示', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本流程有', score: '60-74' },
          { level: '不合格 (<60)', desc: '原型不完整', score: '<60' }
        ]
      },
      'prd-write': {
        title: '需求文档(PRD)撰写', icon: 'fa-clipboard-list', color: 'rgba(109,94,246,0.1)', iconColor: 'text-brand-purple', type: 'B',
        sections: [
          { label: '任务描述', text: '撰写一份完整的产品需求文档（PRD），含背景、目标、功能范围和验收标准。' },
          { label: '关联技能', text: '产品思维 / 文档写作' },
          { label: '预计时长', text: '3 小时' },
          { label: '验收标准', text: '1) 结构清晰；2) 需求可量化；3) 优先级明确' },
        ],
        keyPoints: ['需求分析', 'SMART 原则', 'MVP 定义', '验收标准'],
        rubric: [
          { level: '优秀 (90-100)', desc: 'PRD 完整可执行', score: '90-100' },
          { level: '良好 (75-89)', desc: '结构清晰', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本框架有', score: '60-74' },
          { level: '不合格 (<60)', desc: '内容空洞', score: '<60' }
        ]
      },
      'user-interview': {
        title: '用户访谈实践', icon: 'fa-comments', color: 'rgba(109,94,246,0.1)', iconColor: 'text-brand-purple', type: 'B',
        sections: [
          { label: '任务描述', text: '设计访谈提纲并完成 3-5 次用户访谈，输出关键发现和改进建议。' },
          { label: '关联技能', text: '用户研究 / 访谈技巧' },
          { label: '预计时长', text: '4 小时' },
          { label: '验收标准', text: '1) 提纲完整；2) 记录详细；3) 发现有价值' },
        ],
        keyPoints: ['开放式提问', '用户画像', '洞察提炼', '建议优先级'],
        rubric: [
          { level: '优秀 (90-100)', desc: '洞察深入、建议可行', score: '90-100' },
          { level: '良好 (75-89)', desc: '访谈完整', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本完成访谈', score: '60-74' },
          { level: '不合格 (<60)', desc: '缺乏有效洞察', score: '<60' }
        ]
      },
      'competitor-analysis': {
        title: '竞品分析报告', icon: 'fa-chart-bar', color: 'rgba(109,94,246,0.1)', iconColor: 'text-brand-purple', type: 'B',
        sections: [
          { label: '任务描述', text: '选择 3-5 个竞品进行系统分析，输出功能对比、优劣分析和差异化策略。' },
          { label: '关联技能', text: '竞品分析 / 战略思维' },
          { label: '预计时长', text: '4 小时' },
          { label: '验收标准', text: '1) 竞品选择合理；2) 分析维度全面；3) 策略可执行' },
        ],
        keyPoints: ['功能矩阵', 'SWOT 分析', '差异化定位', '市场空白'],
        rubric: [
          { level: '优秀 (90-100)', desc: '分析深入、策略清晰', score: '90-100' },
          { level: '良好 (75-89)', desc: '分析完整', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本分析完成', score: '60-74' },
          { level: '不合格 (<60)', desc: '分析片面', score: '<60' }
        ]
      },
      'sql-query': {
        title: 'SQL 复杂查询实战', icon: 'fa-database', color: 'rgba(14,165,183,0.1)', iconColor: 'text-brand-cyan', type: 'A',
        sections: [
          { label: '任务描述', text: '使用 SQL 完成多表关联、子查询、窗口函数等复杂查询场景。' },
          { label: '关联技能', text: 'SQL / 关系型数据库' },
          { label: '预计时长', text: '4 小时' },
          { label: '验收标准', text: '1) SQL 正确可执行；2) 性能可接受；3) 含注释说明' },
        ],
        keyPoints: ['JOIN 类型', '子查询', '窗口函数', 'CTE'],
        rubric: [
          { level: '优秀 (90-100)', desc: '多种写法对比、含性能分析', score: '90-100' },
          { level: '良好 (75-89)', desc: 'SQL 正确', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本查询正确', score: '60-74' },
          { level: '不合格 (<60)', desc: 'SQL 有误', score: '<60' }
        ]
      },
      'excel-pivot': {
        title: 'Excel 数据透视表', icon: 'fa-table', color: 'rgba(14,165,183,0.1)', iconColor: 'text-brand-cyan', type: 'B',
        sections: [
          { label: '任务描述', text: '使用数据透视表对销售数据进行多维度分析，输出交互式仪表板。' },
          { label: '关联技能', text: 'Excel / 数据分析' },
          { label: '预计时长', text: '3 小时' },
          { label: '验收标准', text: '1) 透视表正确；2) 多维度可切换；3) 仪表板清晰' },
        ],
        keyPoints: ['数据透视表', '切片器', '条件格式', '数据验证'],
        rubric: [
          { level: '优秀 (90-100)', desc: '仪表板交互性强', score: '90-100' },
          { level: '良好 (75-89)', desc: '分析完整', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本分析完成', score: '60-74' },
          { level: '不合格 (<60)', desc: '分析有误', score: '<60' }
        ]
      },
      'python-viz': {
        title: 'Python 数据可视化', icon: 'fa-chart-pie', color: 'rgba(14,165,183,0.1)', iconColor: 'text-brand-cyan', type: 'A',
        sections: [
          { label: '任务描述', text: '使用 Matplotlib/Seaborn 对数据进行多维度可视化，输出洞察报告。' },
          { label: '关联技能', text: 'Python / 数据可视化' },
          { label: '预计时长', text: '3 小时' },
          { label: '验收标准', text: '1) 图表类型选择合理；2) 美化到位；3) 含文字解读' },
        ],
        keyPoints: ['图表选择', '样式美化', '标注注释', '叙事性图表'],
        rubric: [
          { level: '优秀 (90-100)', desc: '图表精美、洞察深刻', score: '90-100' },
          { level: '良好 (75-89)', desc: '图表正确', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本可视化完成', score: '60-74' },
          { level: '不合格 (<60)', desc: '图表有误', score: '<60' }
        ]
      },
      'resume-opt': {
        title: '简历优化迭代', icon: 'fa-file-lines', color: 'rgba(15,12,41,0.06)', iconColor: 'text-content-sub', type: 'B',
        sections: [
          { label: '任务描述', text: '基于岗位 JD 优化简历，突出匹配技能和量化成果。' },
          { label: '关联技能', text: '简历优化 / 自我包装' },
          { label: '预计时长', text: '2 小时' },
          { label: '验收标准', text: '1) 与 JD 匹配度 > 80%；2) 含量化成果；3) 格式规范' },
        ],
        keyPoints: ['STAR 法则', '关键词匹配', '量化成果', '简洁表达'],
        rubric: [
          { level: '优秀 (90-100)', desc: '匹配度高、表达专业', score: '90-100' },
          { level: '良好 (75-89)', desc: '匹配度较好', score: '75-89' },
          { level: '合格 (60-74)', desc: '基本优化完成', score: '60-74' },
          { level: '不合格 (<60)', desc: '优化不明显', score: '<60' }
        ]
      },
    };
    function openTaskDetail(key) {
      const d = TASK_DETAILS[key];
      if (!d) { showToast('任务详情加载中...', 'info'); return; }
      document.getElementById('task-modal-title').textContent = d.title;
      document.getElementById('task-modal-sub').textContent = d.sections[0].text.slice(0, 30) + '...';
      const iconWrap = document.getElementById('task-modal-icon');
      iconWrap.style.background = d.color;
      iconWrap.innerHTML = '<i class="fa-solid ' + d.icon + ' ' + d.iconColor + '"></i>';
      // 基础 sections
      let bodyHtml = d.sections.map(s =>
        '<div>' +
          '<div class="text-[11px] font-display tracking-[0.12em] uppercase text-content-sub mb-1.5">' + s.label + '</div>' +
          '<div class="text-[13px] text-content-text leading-relaxed">' + s.text + '</div>' +
        '</div>'
      ).join('<div class="border-t border-content-divider"></div>');

      // 考察点（keyPoints）
      if (Array.isArray(d.keyPoints) && d.keyPoints.length) {
        bodyHtml += '<div class="border-t border-content-divider"></div>' +
          '<div>' +
            '<div class="text-[11px] font-display tracking-[0.12em] uppercase text-content-sub mb-2"><i class="fa-solid fa-bullseye mr-1 text-brand-purple"></i>考察点</div>' +
            '<div class="flex flex-wrap gap-1.5">' +
              d.keyPoints.map(k => '<span class="px-2 py-0.5 rounded-md text-[11px] font-medium" style="background:rgba(109,94,246,0.1);color:#6d5ef6">' + k + '</span>').join('') +
            '</div>' +
          '</div>';
      }

      // 参考资料链接（references）
      if (Array.isArray(d.references) && d.references.length) {
        bodyHtml += '<div class="border-t border-content-divider"></div>' +
          '<div>' +
            '<div class="text-[11px] font-display tracking-[0.12em] uppercase text-content-sub mb-2"><i class="fa-solid fa-book mr-1 text-brand-cyan"></i>参考资料</div>' +
            '<div class="space-y-1.5">' +
              d.references.map(r =>
                '<a href="' + r.url + '" target="_blank" rel="noopener" class="flex items-center gap-1.5 text-[12px] text-brand-cyan hover:underline">' +
                  '<i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>' +
                  '<span>' + r.title + '</span>' +
                '</a>'
              ).join('') +
            '</div>' +
          '</div>';
      }

      // 评分标准（rubric）
      if (Array.isArray(d.rubric) && d.rubric.length) {
        const levelColor = { '优秀': '#10b981', '良好': '#0ea5b7', '合格': '#f59e0b', '不合格': '#ef4444' };
        bodyHtml += '<div class="border-t border-content-divider"></div>' +
          '<div>' +
            '<div class="text-[11px] font-display tracking-[0.12em] uppercase text-content-sub mb-2"><i class="fa-solid fa-clipboard-check mr-1 text-state-success"></i>评分标准</div>' +
            '<div class="space-y-1.5">' +
              d.rubric.map(r => {
                const key = r.level.charAt(0);
                const color = levelColor[key] || '#6b7280';
                return '<div class="flex items-start gap-2 text-[12px]">' +
                  '<span class="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:' + color + '">' + r.level + '</span>' +
                  '<span class="text-content-sub leading-relaxed flex-1">' + r.desc + '</span>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>';
      }

      document.getElementById('task-modal-body').innerHTML = bodyHtml;
      const action = document.getElementById('task-modal-action');
      action.onclick = () => {
        closeTaskDetail();
        openSubmitModal(d.title, d.type);
      };
      openModal('task-modal');
    }
    function closeTaskDetail() { closeModal('task-modal'); }

    // ============ TASKS: FILTER & REFRESH ============
    function openFilter() {
      openModal('filter-modal');
      // Bind chip toggles once
      ['filter-status','filter-type','filter-priority'].forEach(id => {
        const c = document.getElementById(id);
        if (c && !c.dataset.bound) {
          c.dataset.bound = '1';
          c.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => ch.classList.toggle('selected')));
        }
      });
    }
    function resetFilter() {
      ['filter-status','filter-type','filter-priority'].forEach(id => {
        document.querySelectorAll('#' + id + ' .chip').forEach(c => c.classList.remove('selected'));
      });
      showToast('已重置筛选条件', 'info');
    }
    function applyFilter() {
      const any = document.querySelectorAll('#filter-modal .chip.selected').length;
      closeModal('filter-modal');
      showToast(any ? '已应用 ' + any + ' 项筛选条件' : '已清除全部筛选', 'check');
    }
    function refreshQueue() {
      showToast('任务队列已刷新，暂无新任务派发', 'robot');
    }

    // ============ TASK FILTER (chip toggle) ============
    let activeTaskFilter = 'active'; // 当前激活的筛选器，用于重建DOM后恢复

    function toggleTaskFilter(el) {
      const filter = el.dataset.filter;
      activeTaskFilter = filter;
      document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      applyTaskFilter(filter);
    }

    function applyTaskFilter(filter) {
      const queue = document.getElementById('task-queue-list');
      if (!queue) return;
      const cards = queue.querySelectorAll('[data-status]');
      let visibleCount = 0;

      cards.forEach(card => {
        const status = card.dataset.status;
        let show = false;
        switch (filter) {
          case 'active':
            show = (status === 'pending' || status === 'progress' || status === 'locked');
            break;
          case 'all':
            show = true;
            break;
          case 'pending':
            show = (status === 'pending');
            break;
          case 'progress':
            show = (status === 'progress');
            break;
          case 'history':
            show = false;
            break;
          default:
            show = true;
        }
        card.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });

      const emptyState = document.getElementById('task-empty-state');
      if (emptyState) {
        emptyState.style.display = visibleCount === 0 ? '' : 'none';
      }

      // 历史筛选：展开历史记录区域
      const historySection = document.getElementById('task-history-section');
      const historyContent = document.getElementById('history-content');
      const chevron = document.getElementById('history-chevron');
      if (historySection && historyContent) {
        if (filter === 'history') {
          historyContent.style.maxHeight = historyContent.scrollHeight + 'px';
          historyContent.style.opacity = '1';
          if (chevron) chevron.style.transform = 'rotate(180deg)';
          historySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          historyContent.style.maxHeight = '0px';
          historyContent.style.opacity = '0';
          if (chevron) chevron.style.transform = '';
        }
      }
    }

    // ============ HISTORY SECTION TOGGLE ============
    function toggleHistorySection() {
      const content = document.getElementById('history-content');
      const chevron = document.getElementById('history-chevron');
      if (!content) return;
      const isCollapsed = content.style.maxHeight === '0px' || content.style.maxHeight === '0';
      if (isCollapsed) {
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.opacity = '1';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
      } else {
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
      }
    }

    // ============ CONFETTI CELEBRATION ============
    function triggerConfetti() {
      const container = document.getElementById('confetti-container');
      if (!container) return;
      container.style.display = '';
      container.innerHTML = '';
      for (let i = 0; i < 18; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        const delay = (Math.random() * 0.4).toFixed(2);
        piece.style.animationDelay = delay + 's';
        piece.style.left = (Math.random() * 100) + '%';
        const colors = ['#6D5EF6', '#0EA5B7', '#10B981', '#F59E0B', '#F43F5E', '#8B7FF8'];
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        const width = (6 + Math.random() * 8) + 'px';
        const height = (8 + Math.random() * 10) + 'px';
        piece.style.width = width;
        piece.style.height = height;
        piece.style.borderRadius = Math.random() > 0.5 ? '2px' : '50%';
        container.appendChild(piece);
      }
      setTimeout(() => {
        container.style.display = 'none';
        container.innerHTML = '';
      }, 3500);
    }

    // ============ RESUME EXPORT ============
    function exportResume() {
      const r = collectResume();
      if (!r.name) { showToast('请先填写简历再导出', 'warn'); switchPage('resume'); return; }
      const kw = JD_KEYWORDS[r.intention] || [];
      const missing = kw.filter(k => !r.skills.some(s => s.toLowerCase() === k.toLowerCase() || s.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(s.toLowerCase())));
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${r.name}-${r.intention}-简历</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:'PingFang SC','Microsoft YaHei',Arial,sans-serif}
body{padding:40px;color:#1a1a1a;line-height:1.7;max-width:820px;margin:0 auto}
h1{font-size:26px;margin-bottom:4px}
.contact{color:#666;font-size:13px;margin:6px 0 18px}
.contact span{margin-right:14px}
h2{font-size:15px;color:#6d5ef6;border-bottom:2px solid #6d5ef6;padding-bottom:5px;margin:22px 0 12px}
.item{margin-bottom:14px}
.item-head{display:flex;justify-content:space-between;font-weight:600;font-size:14px}
.item-sub{color:#666;font-size:12px;margin-top:2px}
.desc{font-size:13px;color:#333;margin-top:4px}
.skills{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.tag{background:#f0effe;color:#6d5ef6;padding:3px 10px;border-radius:12px;font-size:12px}
.miss{background:#fef2f2;color:#dc2626}
.edu{font-size:13px}
@media print{body{padding:20px}}
</style></head><body>
<h1>${r.name}</h1>
<div class="contact">
${r.intention ? `<span>求职意向：${r.intention}</span>` : ''}
${r.phone ? `<span>电话：${r.phone}</span>` : ''}
${r.email ? `<span>邮箱：${r.email}</span>` : ''}
${r.city ? `<span>城市：${r.city}</span>` : ''}
${r.homepage ? `<span>主页：${r.homepage}</span>` : ''}
</div>
${r.school ? `<h2>教育背景</h2><div class="edu"><b>${r.school}</b> · ${r.major || ''} · ${r.degree || ''} ${r.eduTime ? '（'+r.eduTime+'）' : ''}</div>${r.courses ? `<div class="desc">相关课程：${r.courses}</div>` : ''}` : ''}
${r.experiences.length ? `<h2>项目与实习经历</h2>${r.experiences.map(e => `<div class="item"><div class="item-head"><span>${e.title || ''} · ${e.role || ''}</span><span class="item-sub">${e.time || ''}</span></div><div class="desc">${(e.desc || '').replace(/\n/g,'<br>')}</div></div>`).join('')}` : ''}
${r.skills.length ? `<h2>技能清单</h2><div class="skills">${r.skills.map(s => `<span class="tag">${s}</span>`).join('')}${missing.length ? `<span class="tag miss" title="ATS 建议补充">+ ${missing.slice(0,5).join(' / ')}（建议补充）</span>` : ''}</div>` : ''}
<p style="margin-top:30px;color:#999;font-size:11px;text-align:center">由 AI 简历诊断工坊生成 · ${new Date().toLocaleDateString('zh-CN')}</p>
</body></html>`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${r.name}-${r.intention}-简历.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('优化版简历已导出（可用浏览器打印为 PDF）', 'check');
    }

    // ============ DIAGNOSIS: REDIAGNOSE ============
    function rediagnose() {
      showConfirm('重新诊断', 'AI 将重新分析你的能力差距，预计需要 30 秒，是否继续？', 'redignose', () => {
        showToast('AI 正在重新诊断...', 'robot');
        setTimeout(() => {
          showToast('诊断完成，匹配度提升至 73%', 'check');
          // Re-init radar if visible
          if (charts.diagnosisRadar) {
            charts.diagnosisRadar.dispose();
            charts.diagnosisRadar = null;
            chartsInit.diagnosisRadar = false;
            if (!document.getElementById('diag-view-radar').classList.contains('hidden')) {
              initDiagnosisRadar();
              chartsInit.diagnosisRadar = true;
            }
          }
          // P1：打通诊断 → 任务的数据通路
          syncDiagnosisToTasks();
        }, 1800);
      });
    }

    // ============ 诊断 → 任务 数据通路 ============
    // 重新诊断后，若 TypeScript 仍未掌握，将任务中心的对应任务标记为高优先级（红色边框）
    function syncDiagnosisToTasks() {
      const list = document.getElementById('skill-gaps-list');
      if (!list) return;
      let tsNotMastered = false;
      const items = list.querySelectorAll(':scope > .rounded-xl, :scope > div');
      items.forEach(item => {
        const nameEl = item.querySelector('.font-semibold');
        if (!nameEl) return;
        const name = nameEl.textContent.trim().toLowerCase();
        const badge = item.querySelector('.badge');
        if (name.includes('typescript')) {
          const status = badge ? badge.textContent.trim() : '';
          if (status === '未掌握' || status === '待提升') tsNotMastered = true;
        }
      });
      if (!tsNotMastered) return;
      // 在任务中心（page-tasks 与 dashboard 的 todo-list）查找 TypeScript 任务卡片
      const taskCards = document.querySelectorAll('#page-tasks .card, #todo-list .card, #page-tasks .card-hover');
      taskCards.forEach(card => {
        const titleEl = card.querySelector('h3');
        if (!titleEl) return;
        if (titleEl.textContent.trim().toLowerCase().includes('typescript')) {
          // 标记为高优先级：红色边框
          card.classList.add('task-priority-high');
          card.style.borderColor = '#ef4444';
          card.style.boxShadow = '0 0 0 2px rgba(239,68,68,0.15)';
          // 如果存在优先级 badge，升级为"优先级高"
          const badges = card.querySelectorAll('.badge');
          badges.forEach(b => {
            if (b.textContent.includes('优先级')) {
              b.textContent = '优先级高';
              b.style.background = 'rgba(239,68,68,0.1)';
              b.style.color = '#dc2626';
            }
          });
        }
      });
    }

    // ============ ECHARTS ============
    function initDashboardCharts() {
      const radarEl = document.getElementById('chart-radar');
      if (radarEl && !charts.radar) {
        charts.radar = echarts.init(radarEl);
      }
      const ringEl = document.getElementById('chart-ring');
      if (ringEl && !charts.ring) {
        charts.ring = echarts.init(ringEl);
      }
      const trendEl = document.getElementById('chart-trend');
      if (trendEl && !charts.trend) {
        charts.trend = echarts.init(trendEl);
      }
      updateChartsWithAccount(currentAccount);
    }

    function updateChartsWithAccount(a) {
      const isNew = a.isNewUser;
      
      const welcomeCard = document.getElementById('newuser-welcome');
      const trendCard = document.getElementById('trend-chart-card');
      const todoEmpty = document.getElementById('newuser-todo-empty');
      const todoList = document.getElementById('todo-list');
      const todoTitle = document.getElementById('todo-title');
      const ringTitle = document.getElementById('ring-title');
      const statMastered = document.getElementById('stat-mastered');
      const statImprove = document.getElementById('stat-improve');

      if (isNew) {
        if (welcomeCard) welcomeCard.classList.remove('hidden');
        if (trendCard) trendCard.classList.add('hidden');
        if (todoEmpty) todoEmpty.classList.remove('hidden');
        if (todoList) todoList.classList.add('hidden');
        if (todoTitle) todoTitle.textContent = '推荐起步';
      } else {
        if (welcomeCard) welcomeCard.classList.add('hidden');
        if (trendCard) trendCard.classList.remove('hidden');
        if (todoEmpty) todoEmpty.classList.add('hidden');
        if (todoList) todoList.classList.remove('hidden');
        if (todoTitle) todoTitle.textContent = '待办任务';
      }

      if (charts.radar) {
        let radarData, targetData;
        if (isNew) {
          radarData = [20, 10, 30, 15, 15];
          targetData = [85, 80, 75, 70, 85];
        } else {
          radarData = [65 + Math.floor((a.tasksDone / 20) * 15), 45 + Math.floor((a.tasksDone / 20) * 30), 65 + Math.floor((a.studyHours / 80) * 15), 50 + Math.floor((a.tasksDone / 20) * 20), 60 + Math.floor((a.tasksDone / 20) * 20)];
          targetData = [90, 85, 80, 75, 88];
        }
        charts.radar.setOption({
          tooltip: { trigger: 'item' },
          legend: { show: false },
          radar: {
            indicator: [
              { name: '技术能力', max: 100 },
              { name: '项目经验', max: 100 },
              { name: '软技能', max: 100 },
              { name: '行业知识', max: 100 },
              { name: '工具熟练度', max: 100 },
            ],
            radius: '68%',
            splitNumber: 4,
            axisName: { color: '#6B7280', fontSize: 12, fontWeight: 600 },
            splitLine: { lineStyle: { color: '#E5E7EB' } },
            splitArea: { areaStyle: { color: ['rgba(123,79,224,0.02)', 'rgba(123,79,224,0.04)'] } },
            axisLine: { lineStyle: { color: '#E5E7EB' } },
          },
          series: [{
            type: 'radar',
            data: [
              { value: radarData, name: '当前能力', areaStyle: { color: 'rgba(123,79,224,0.25)' }, lineStyle: { color: '#7B4FE0', width: 2 }, itemStyle: { color: '#7B4FE0' } },
              { value: targetData, name: '岗位要求', areaStyle: { color: 'rgba(0,184,212,0.1)' }, lineStyle: { color: '#00B8D4', width: 2, type: 'dashed' }, itemStyle: { color: '#00B8D4' } },
            ],
            animationDuration: 1200,
          }],
        });
      }

      if (charts.ring) {
        const percent = isNew ? 5 : a.matchPercent;
        const labelText = isNew ? '待起步' : '整体达成';
        if (ringTitle) ringTitle.textContent = isNew ? '初始状态' : '整体达成';
        if (statMastered) statMastered.textContent = isNew ? 0 : Math.max(3, Math.floor(a.jobTags.length * 0.4));
        if (statImprove) statImprove.textContent = isNew ? a.jobTags.length : a.jobTags.length - Math.floor(a.jobTags.length * 0.4);
        
        charts.ring.setOption({
          series: [{
            type: 'pie', radius: ['68%', '88%'], center: ['50%', '50%'],
            silent: true,
            label: { show: true, position: 'center',
              formatter: '{a|' + percent + '%}\n{b|' + labelText + '}',
              rich: { a: { fontSize: 32, fontWeight: 800, color: isNew ? '#9CA3AF' : '#7B4FE0', fontFamily: 'Sora', lineHeight: 38 }, b: { fontSize: 11, color: '#6B7280' } }
            },
            data: [
              { value: percent, itemStyle: { color: isNew ? { colorStops: [{ offset: 0, color: '#9CA3AF' }, { offset: 1, color: '#D1D5DB' }], type: 'linear', x: 0, y: 0, x2: 1, y2: 1 } : { type: 'linear', x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: '#7B4FE0' }, { offset: 1, color: '#00B8D4' }] } } },
              { value: 100 - percent, itemStyle: { color: '#EEF0F4' } },
            ],
            animationDuration: 1400,
          }],
        });
      }

      if (charts.trend && !isNew) {
        const months = ['2月', '3月', '4月', '5月', '6月', '7月'];
        const startVal = Math.max(30, a.matchPercent - 30 - Math.floor(Math.random() * 10));
        const trendData = [];
        for (let i = 0; i < 6; i++) {
          trendData.push(Math.min(95, startVal + Math.floor((a.matchPercent - startVal) * (i / 5) + (Math.random() * 4 - 2))));
        }
        charts.trend.setOption({
          tooltip: { trigger: 'axis', formatter: '{b}<br/>匹配度：{c}%' },
          grid: { left: 30, right: 20, top: 20, bottom: 30 },
          xAxis: { type: 'category', data: months, axisLine: { lineStyle: { color: '#E5E7EB' } }, axisLabel: { color: '#6B7280', fontSize: 11 }, axisTick: { show: false } },
          yAxis: { type: 'value', min: Math.max(20, startVal - 10), max: 100, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#F0F1F5' } }, axisLabel: { color: '#6B7280', fontSize: 11, formatter: '{value}%' } },
          series: [{
            type: 'line', smooth: true, data: trendData,
            symbol: 'circle', symbolSize: 8,
            lineStyle: { width: 3, color: '#7B4FE0' },
            itemStyle: { color: '#7B4FE0', borderColor: '#fff', borderWidth: 2 },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(123,79,224,0.25)' }, { offset: 1, color: 'rgba(123,79,224,0)' }] } },
            animationDuration: 1500,
          }],
        });
      }
    }

    function initDiagnosisRadar() {
      const el = document.getElementById('chart-diagnosis-radar');
      if (!el || charts.diagnosisRadar) return;
      charts.diagnosisRadar = echarts.init(el);
      charts.diagnosisRadar.setOption({
        tooltip: { trigger: 'item' },
        radar: {
          indicator: [
            { name: '技术能力', max: 100 },
            { name: '项目经验', max: 100 },
            { name: '软技能', max: 100 },
            { name: '行业知识', max: 100 },
            { name: '工具熟练度', max: 100 },
          ],
          radius: '70%',
          splitNumber: 5,
          axisName: { color: '#1A1A2E', fontSize: 13, fontWeight: 700 },
          splitLine: { lineStyle: { color: '#E5E7EB' } },
          splitArea: { areaStyle: { color: ['rgba(123,79,224,0.02)', 'rgba(123,79,224,0.05)'] } },
          axisLine: { lineStyle: { color: '#E5E7EB' } },
        },
        series: [{
          type: 'radar',
          data: [
            { value: [65, 48, 72, 55, 60], name: '当前能力', areaStyle: { color: 'rgba(123,79,224,0.3)' }, lineStyle: { color: '#7B4FE0', width: 2.5 }, itemStyle: { color: '#7B4FE0' } },
            { value: [90, 85, 80, 75, 88], name: '岗位要求', areaStyle: { color: 'rgba(0,184,212,0.12)' }, lineStyle: { color: '#00B8D4', width: 2.5, type: 'dashed' }, itemStyle: { color: '#00B8D4' } },
          ],
          animationDuration: 1400,
        }],
      });
    }

    // resize handling
    window.addEventListener('resize', () => {
      Object.values(charts).forEach(c => c && c.resize());
    });

    // ============ TREND RANGE SWITCH ============
    function switchTrendRange(range, btn) {
      // Update active state
      document.querySelectorAll('#page-dashboard .view-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      if (!charts.trend) return;
      if (range === '3m') {
        charts.trend.setOption({
          xAxis: { data: ['5月', '6月', '7月'] },
          series: [{ data: [61, 68, 73] }],
        });
      } else {
        charts.trend.setOption({
          xAxis: { data: ['2月', '3月', '4月', '5月', '6月', '7月'] },
          series: [{ data: [42, 48, 55, 61, 68, 73] }],
        });
      }
    }

    // ============ AUTH & ONBOARDING ============
    function switchAuthTab(tab) {
      document.getElementById('tab-login').classList.toggle('active', tab === 'login');
      document.getElementById('tab-register').classList.toggle('active', tab === 'register');
      document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
      document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
    }

    function togglePwd(inputId, iconId) {
      const input = document.getElementById(inputId);
      const icon = document.getElementById(iconId);
      if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-regular fa-eye-slash eye-icon';
      } else {
        input.type = 'password';
        icon.className = 'fa-regular fa-eye eye-icon';
      }
    }

    function doLogin() {
      const email = document.getElementById('login-email').value.trim();
      const pwd = document.getElementById('login-pwd').value;
      if (!email) { showToast('请输入邮箱或手机号','error'); return; }
      if (!pwd) { showToast('请输入密码','error'); return; }
      
      // 优先从账号独立存储中加载（保留用户上传的头像等个性化数据）
      const accountData = loadAccountData(email);
      let foundAccount = null;
      
      if (accountData) {
        // 找到之前保存的账号独立数据（包括用户上传的头像等）
        foundAccount = accountData;
      } else {
        // 根据输入的邮箱匹配预设账号
        const matchedAccount = ACCOUNTS.find(a => a.email === email);
        if (matchedAccount) {
          // 找到匹配的预设账号，使用深拷贝
          foundAccount = cloneAccount(matchedAccount);
        }
      }
      
      if (foundAccount) {
        // 使用找到的账号
        currentAccount = cloneAccount(foundAccount);
        showToast('欢迎回来，' + currentAccount.name + '！', 'check');
      } else {
        // 未找到匹配的账号，使用默认账号的深拷贝
        currentAccount = cloneAccount(ACCOUNTS[0]);
        showToast('账号不存在，已以游客模式进入','info');
      }
      // 保存当前账号状态（包括用户上传的头像）
      saveState();
      enterApp(false);
    }

    function quickLogin(platform) {
      showToast('正在通过' + platform + '登录...','info');
      // 先清除旧的 localStorage 数据
      localStorage.removeItem(STATE_STORAGE_KEY);
      // 社交登录使用第一个预设账号的深拷贝
      currentAccount = cloneAccount(ACCOUNTS[0]);
      saveState();
      setTimeout(() => enterApp(false), 800);
    }

    function doRegister() {
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const pwd = document.getElementById('reg-pwd').value;
      const pwdConfirm = document.getElementById('reg-pwd-confirm').value;
      const grade = document.getElementById('reg-grade').value;
      if (!name) { showToast('请输入昵称','error'); return; }
      if (!email || !email.includes('@')) { showToast('请输入有效邮箱','error'); return; }
      if (!pwd || pwd.length < 6) { showToast('密码至少6位','error'); return; }
      if (pwdConfirm && pwd !== pwdConfirm) { showToast('两次输入的密码不一致','error'); return; }
      if (!grade) { showToast('请选择年级','error'); return; }

      // 先清除旧的 localStorage 数据
      localStorage.removeItem(STATE_STORAGE_KEY);

      // 生成默认头像：若未上传，则基于昵称首字母生成
      let avatar = window.__regAvatarDataUrl || regAvatarDataUrl || '';
      if (!avatar && window.DefaultAvatar) {
        avatar = generateDefaultAvatarDataUrl(name);
      }

      // 创建新账号对象，而不是修改 ACCOUNTS 中的原始数据
      const today = new Date();
      const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const newAccount = {
        id: 'user_' + Date.now(),
        name: name,
        email: email,
        grade: grade,
        avatar: avatar || '',
        major: '未设置',
        target: '待规划',
        school: '未设置',
        bio: '',
        greeting: '你好',
        matchPercent: 0,
        gapPercent: 100,
        tasksPending: 0,
        tasksDone: 0,
        studyHours: 0,
        jobTags: [],
        jobColor: '#6D5EF6',
        isNewUser: true,
        registrationDate: dateStr,
        learningDays: 0,
      };
      
      currentAccount = newAccount;
      saveState();

      // 清除全局头像变量，防止数据残留
      window.__regAvatarDataUrl = '';
      regAvatarDataUrl = '';

      showToast('注册成功！正在为你初始化...','check');
      setTimeout(() => enterApp(true), 600);
    }

    // 将默认头像（昵称首字母）转为 data URL
    function generateDefaultAvatarDataUrl(name) {
      const letter = (name || 'U').charAt(0).toUpperCase();
      const colors = window.APP_OPTIONS ? window.APP_OPTIONS.avatarColors : ['#6D5EF6'];
      const hash = (name || '').split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0);
      const color = colors[Math.abs(hash) % colors.length];
      const endMap = {
        '#6D5EF6': '#8B7FF8', '#0EA5B7': '#14C3DA', '#F59E0B': '#FBBF24',
        '#EF4444': '#F87171', '#10B981': '#34D399', '#8B5CF6': '#A78BFA',
        '#EC4899': '#F472B6', '#F97316': '#FB923C'
      };
      const end = endMap[color] || color;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="${end}"/></linearGradient></defs><circle cx="64" cy="64" r="64" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" font-family="Sora, sans-serif" font-size="64" font-weight="700" fill="#fff">${letter}</text></svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function enterApp(showOnboarding) {
      document.getElementById('auth-page').classList.add('hidden');
      document.getElementById('app-container').classList.remove('hidden');
      if (showOnboarding) {
        document.getElementById('onboarding-page').classList.remove('hidden');
        resetOnboarding();
        // 注册路径也需要同步账号信息
        setTimeout(() => {
          applyAccountToUI();
        }, 100);
      } else {
        setTimeout(() => {
          switchPage('dashboard');
          // 延迟同步账号信息，确保所有 DOM 元素（包括 profile 页面的头像）都已渲染
          setTimeout(() => {
            applyAccountToUI();
          }, 200);
        }, 50);
      }
    }

    function confirmLogout() {
      closeUserMenu();
      showToast('已退出登录','info');
      setTimeout(() => {
        // 保存当前账号数据到独立存储（保留用户上传的头像等个性化数据）
        saveAccountData();
        // 清除当前登录状态（但保留账号独立存储）
        localStorage.removeItem(STATE_STORAGE_KEY);
        // 重置为默认账号的深拷贝
        currentAccount = cloneAccount(ACCOUNTS[0]);
        // 重置登录表单
        const loginEmail = document.getElementById('login-email');
        const loginPwd = document.getElementById('login-pwd');
        if (loginEmail) loginEmail.value = '';
        if (loginPwd) loginPwd.value = '';
        // 显示登录页
        document.getElementById('auth-page').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('onboarding-page').classList.add('hidden');
        switchPage('dashboard');
      }, 400);
    }

    // ============ ONBOARDING ============
    let obSelectedTags = new Set();
    let obIdentity = '';
    let obStep = 0;

    function resetOnboarding() {
      obStep = 0;
      obSelectedTags.clear();
      obIdentity = '';
      document.querySelectorAll('.identity-card').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.onboard-tag').forEach(t => t.classList.remove('selected'));
      document.getElementById('ob-tag-count').textContent = '已选 0 个标签';
      const btn0 = document.getElementById('ob-btn-0');
      btn0.setAttribute('disabled', '');
      btn0.style.opacity = '0.5';
      btn0.style.cursor = 'not-allowed';
      btn0.style.pointerEvents = 'none';
      const btn1 = document.getElementById('ob-btn-1');
      btn1.setAttribute('disabled', '');
      btn1.style.opacity = '0.5';
      btn1.style.cursor = 'not-allowed';
      btn1.style.pointerEvents = 'none';
      document.getElementById('ai-chat').innerHTML = '';
      document.getElementById('ai-replies').innerHTML = '';
      updateObProgress(0);
      for (let i = 0; i <= 3; i++) {
        document.getElementById('ob-step-' + i).classList.add('hidden');
      }
      document.getElementById('ob-step-0').classList.remove('hidden');
    }

    function selectIdentity(el) {
      document.querySelectorAll('.identity-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      obIdentity = el.dataset.val;
      const btn = document.getElementById('ob-btn-0');
      btn.removeAttribute('disabled');
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.pointerEvents = 'auto';
    }

    function toggleObTag(el) {
      const tag = el.textContent.trim();
      if (el.classList.contains('selected')) {
        el.classList.remove('selected');
        obSelectedTags.delete(tag);
      } else {
        el.classList.add('selected');
        obSelectedTags.add(tag);
      }
      const count = obSelectedTags.size;
      document.getElementById('ob-tag-count').textContent = '已选 ' + count + ' 个标签' + (count < 3 ? '（至少3个）' : '');
      const btn = document.getElementById('ob-btn-1');
      if (count < 3) {
        btn.setAttribute('disabled', '');
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.style.pointerEvents = 'none';
      } else {
        btn.removeAttribute('disabled');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
      }
    }

    function updateObProgress(step) {
      for (let i = 0; i <= 3; i++) {
        const dot = document.getElementById('ob-dot-' + i);
        dot.classList.remove('active', 'done');
        if (i < step) dot.classList.add('done');
        else if (i === step) dot.classList.add('active');
      }
      document.getElementById('ob-step-label').textContent = '第 ' + (step + 1) + ' 步 / 共 4 步';
    }

    function nextObStep(step) {
      if (step === 2 && obSelectedTags.size < 3) {
        showToast('请至少选择 3 个兴趣标签', 'error');
        return;
      }
      if (step === 1 && !obIdentity) {
        showToast('请先选择你的身份', 'error');
        return;
      }
      for (let i = 0; i <= 3; i++) {
        document.getElementById('ob-step-' + i).classList.add('hidden');
      }
      document.getElementById('ob-step-' + step).classList.remove('hidden');
      obStep = step;
      updateObProgress(step);
      if (step === 2) {
        initAIChat();
      }
    }

    let aiChatReplyCount = 0;
    let aiChatHistory = [];

    // ============ AI 多平台配置 ============
    // >>> 预设 API Key：填入你的 Key 即可，页面打开直接连上，无需手动配置 <<<
    const PRESET_AI_KEY = ''; // 例: 'xxxxxxxxxxxx' (智谱) 或 'sk-xxxx' (硅基/DeepSeek)
    const PRESET_AI_PROVIDER = 'zhipu'; // 'zhipu' | 'siliconflow' | 'deepseek'

    const AI_PROVIDERS = {
      zhipu: {
        name: '智谱 GLM-4-Flash',
        label: '永久免费 · 推荐',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        model: 'glm-4-flash',
        keyGuide: 'https://open.bigmodel.cn/usercenter/apikeys',
        keyPrefix: '',
        free: true,
      },
      siliconflow: {
        name: '硅基流动',
        label: '注册送2000万Token',
        endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
        model: 'Qwen/Qwen2.5-7B-Instruct',
        keyGuide: 'https://cloud.siliconflow.cn/account/ak',
        keyPrefix: 'sk-',
        free: true,
      },
      deepseek: {
        name: 'DeepSeek',
        label: '按量付费 · 便宜',
        endpoint: 'https://api.deepseek.com/chat/completions',
        model: 'deepseek-chat',
        keyGuide: 'https://platform.deepseek.com/api_keys',
        keyPrefix: 'sk-',
        free: false,
      },
    };

    let AI_CONFIG = {
      provider: localStorage.getItem('ai_provider') || PRESET_AI_PROVIDER,
      apiKey: localStorage.getItem('ai_api_key') || PRESET_AI_KEY,
    };

    function getCurrentProvider() {
      return AI_PROVIDERS[AI_CONFIG.provider] || AI_PROVIDERS.zhipu;
    }

    function toggleAIConfig() {
      const panel = document.getElementById('ai-config-panel');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        updateAIConfigUI();
      }
    }

    function switchAIProvider(providerKey) {
      AI_CONFIG.provider = providerKey;
      localStorage.setItem('ai_provider', providerKey);
      aiChatHistory = [];
      updateAIConfigUI();
      const p = AI_PROVIDERS[providerKey];
      showToast('已切换至 ' + p.name + (p.free ? '（免费）' : ''), 'check');
    }

    function saveAPIKey() {
      const input = document.getElementById('ai-key-input');
      if (!input || !input.value.trim()) return;
      const key = input.value.trim();
      AI_CONFIG.apiKey = key;
      localStorage.setItem('ai_api_key', key);
      aiChatHistory = [];
      updateAIStatusBadge();
      const p = getCurrentProvider();
      showToast(p.name + ' API Key 已保存', 'check');
    }

    function updateAIConfigUI() {
      const p = getCurrentProvider();
      const input = document.getElementById('ai-key-input');
      if (input) {
        input.value = AI_CONFIG.apiKey;
        input.placeholder = (p.keyPrefix || '') + 'xxxxxxxx...';
      }
      const link = document.getElementById('ai-key-link');
      if (link) link.href = p.keyGuide;

      document.querySelectorAll('.ai-provider-btn').forEach(btn => {
        const isActive = btn.dataset.provider === AI_CONFIG.provider;
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-brand-purple', isActive);
        btn.classList.toggle('border-brand-purple', isActive);
      });
      updateAIStatusBadge();
    }

    function updateAIStatusBadge() {
      const badge = document.getElementById('ai-status-badge');
      const dot = document.getElementById('ai-connected-dot');
      if (proxyAvailable) {
        if (badge) {
          badge.textContent = '代理模式 · 安全连接';
          badge.style.background = 'rgba(16,185,129,0.1)';
          badge.style.color = '#10B981';
        }
        if (dot) {
          dot.classList.remove('hidden');
          dot.style.background = '#10B981';
        }
      } else if (AI_CONFIG.apiKey) {
        const p = getCurrentProvider();
        if (badge) {
          badge.textContent = p.name + ' · 已连接';
          badge.style.background = 'rgba(16,185,129,0.1)';
          badge.style.color = '#10B981';
        }
        if (dot) {
          dot.classList.remove('hidden');
          dot.style.background = '#10B981';
        }
      } else {
        if (badge) {
          badge.textContent = '未连接 · 本地模式';
          badge.style.background = 'rgba(245,158,11,0.1)';
          badge.style.color = '#F59E0B';
        }
        if (dot) dot.classList.add('hidden');
      }
    }

    function buildSystemPrompt() {
      const tags = Array.from(obSelectedTags);
      const topTag = getTopTag();
      const jobInfo = JOB_TAGS_MAP[topTag] || {};
      const jobTitle = jobInfo.title || '待定';
      const jobSkills = (jobInfo.tags || []).join('、');
      return '你是「职引未来」平台的AI职业规划师，性格亲切、专业、鼓励性强。'
        + '当前用户信息：身份「' + (obIdentity || '在校学生') + '」，'
        + '兴趣方向「' + (tags.join('、') || '待补充') + '」，'
        + '推荐目标岗位「' + jobTitle + '」，核心技能要求：' + (jobSkills || '待评估') + '。'
        + '请根据用户信息给出个性化、具体的职业建议。回答控制在200字以内，语气自然口语化，不要用markdown格式。'
        + '可以适当使用emoji，但不要过多。如果用户问的问题超出职业规划范围，可以礼貌引导回来。';
    }

    // 代理服务器地址（支持动态配置）
    // 部署后可通过 window.__AI_PROXY_URL 或 localStorage 设置 Render 后端地址
    const PROXY_URL = window.__AI_PROXY_URL || localStorage.getItem('aiProxyUrl') || 'http://localhost:3456';
    let proxyAvailable = false;

    async function checkProxy() {
      try {
        const res = await fetch(PROXY_URL + '/api/health', { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          proxyAvailable = true;
          updateAIStatusBadge();
        }
      } catch (e) { /* 代理未启动，静默回退 */ }
    }

    async function callAIAPI(userText) {
      aiChatHistory.push({ role: 'user', content: userText });

      // 优先走本地代理（Key 安全）
      if (proxyAvailable) {
        try {
          const res = await fetch(PROXY_URL + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                { role: 'system', content: buildSystemPrompt() },
                ...aiChatHistory.slice(-8),
              ],
              temperature: 0.7,
              max_tokens: 300,
            }),
          });
          if (!res.ok) throw new Error('proxy error: ' + res.status);
          const data = await res.json();
          const reply = data.choices?.[0]?.message?.content || '';
          aiChatHistory.push({ role: 'assistant', content: reply });
          return reply;
        } catch (e) {
          console.warn('Proxy failed:', e);
          aiChatHistory.pop();
          return null;
        }
      }

      // 回退：前端直连（需用户自行配置 Key）
      if (!AI_CONFIG.apiKey) {
        aiChatHistory.pop();
        return null;
      }
      const p = getCurrentProvider();
      try {
        const res = await fetch(p.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + AI_CONFIG.apiKey,
          },
          body: JSON.stringify({
            model: p.model,
            messages: [
              { role: 'system', content: buildSystemPrompt() },
              ...aiChatHistory.slice(-8),
            ],
            temperature: 0.7,
            max_tokens: 300,
          }),
        });
        if (!res.ok) throw new Error('API error: ' + res.status);
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || '';
        aiChatHistory.push({ role: 'assistant', content: reply });
        return reply;
      } catch (e) {
        console.warn(p.name + ' API failed:', e);
        aiChatHistory.pop();
        return null;
      }
    }

    function getFallbackResponse(text) {
      const identText = obIdentity === '已工作想转行' ? '转行的话确实需要多花点时间，但只要有决心完全来得及' : '只要有兴趣，入门其实不难';
      const job = JOB_TAGS_MAP[getTopTag()]?.title || '这个方向';
      
      if (text.includes('岗位') || text.includes('适合什么') || text.includes('做什么')) {
        return pickRandom(aiResponsePool.job)();
      } else if (text.includes('多久') || text.includes('时间') || text.includes('学会') || text.includes('多长时间')) {
        return `这个因人而异哦～如果是零基础入门，一般每天投入2-3小时，3-6个月可以达到入门水平可以找实习；想达到能正式工作的水平大概需要6-12个月的系统学习和项目实践。不过不用太担心时间，我们的学习路径是循序渐进的，每一步都有明确目标，你跟着完成任务就能感受到自己的进步。`;
      } else if (text.includes('难不难') || text.includes('难吗') || text.includes('零基础')) {
        return `${identText}！我见过很多零基础的同学通过系统学习都成功入行。关键是不要畏难，从最简单的开始，一步步来，遇到问题我们的AI助手也会帮你解答。我们平台的任务都是从易到难设计的，适合新手循序渐进学习。`;
      } else if (text.includes('前景') || text.includes('发展') || text.includes('薪资') || text.includes('工资')) {
        return `${job}目前发展前景还是很不错的。随着数字化转型持续推进，相关人才需求一直在增长。应届生起薪普遍在15-25K之间，有3-5年经验后能达到30-50K，具体还是看个人能力。而且这个方向技术更新迭代快，持续学习的话成长空间很大。`;
      } else if (text.includes('技能') || text.includes('学什么') || text.includes('怎么学') || (text.includes('入门') && !text.includes('多久') && !text.includes('难'))) {
        return pickRandom(aiResponsePool.skill)();
      } else if (text.includes('简历') || text.includes('竞争力')) {
        return pickRandom(aiResponsePool.resume)();
      } else if (text.includes('面试') || text.includes('offer') || text.includes('找工作')) {
        return pickRandom(aiResponsePool.interview)();
      } else if (text.includes('建议') || text.includes('其他') || text.includes('还有')) {
        return pickRandom(aiResponsePool.suggestion)();
      } else {
        return pickRandom(aiResponsePool.generic)();
      }
    }

    const aiResponsePool = {
      greetings: [
        '你好呀！我是你的专属AI职业规划师 👋 很高兴认识你！',
        '嗨～欢迎来到职引未来！我来帮你规划职业路径 🎯',
        '你好！接下来我会根据你的选择，给你一些个性化建议～',
      ],
      identityAnalysis: [
        () => `我注意到你是「${obIdentity}」，这个阶段做职业规划真的非常重要！`,
        () => `看到你选择了「${obIdentity}」身份，这正是探索方向的好时机呢～`,
        () => `作为「${obIdentity}」，提前做好职业准备能让你在求职时快人一步！`,
      ],
      tagAnalysis: [
        () => `你对${Array.from(obSelectedTags).slice(0, 2).join('、')}感兴趣，这个方向目前市场需求很不错哦！`,
        () => `${Array.from(obSelectedTags).slice(0, 2).join('、')}是很有前景的方向，而且和你的兴趣匹配度很高～`,
        () => `选择${Array.from(obSelectedTags).slice(0, 2).join('、')}方向的话，发展空间还是挺大的！`,
      ],
      job: [
        () => `结合你的兴趣，我推荐你优先考虑${JOB_TAGS_MAP[getTopTag()]?.title || '相关技术岗位'}。这个岗位目前人才缺口比较大，起薪也不错，而且未来3-5年发展趋势很好。我会在工作台为你推荐匹配度高的岗位列表，你可以看到每个岗位的要求、薪资范围和你的匹配度。`,
        () => `说到岗位方向，根据你的标签，我觉得${JOB_TAGS_MAP[getTopTag()]?.title || '技术开发岗位'}会很适合你！这类岗位既需要一定的技术基础，也看重实践能力，正好可以通过我们平台的任务体系来逐步提升。进入系统后你就能看到详细的岗位画像啦。`,
        () => `我帮你分析一下：${Array.from(obSelectedTags).join('、')}这些技能点，正好对应${JOB_TAGS_MAP[getTopTag()]?.title || '相关岗位'}的核心要求。目前互联网行业对这类人才需求旺盛，尤其是有实际项目经验的候选人，薪资待遇都很可观。系统后续会持续更新适合你的岗位推荐。`,
      ],
      skill: [
        () => `对于新手来说，我建议你先从基础开始：${(JOB_TAGS_MAP[getTopTag()]?.tags || [])[0] || '核心基础'}是这个方向的敲门砖，一定要打牢基础。不要一开始就追求学习各种热门框架，基础扎实了学什么都快。我们的「能力诊断」会帮你精准定位薄弱点，然后给你安排循序渐进的学习任务。`,
        () => `不知道学什么很正常！根据你选的方向，我给你梳理一下优先级：首先掌握${(JOB_TAGS_MAP[getTopTag()]?.tags || ['核心技能'])[0]}，这是一切的基础；然后学习${(JOB_TAGS_MAP[getTopTag()]?.tags || ['核心技能'])[1] || '进阶技术'}，这是目前行业主流技术；最后通过项目实战把知识串起来。系统会自动帮你规划学习路径，每天告诉你该学什么。`,
        () => `这个问题问得好！职业技能学习最忌讳盲目跟风。针对你的方向，我建议你走「基础-实战-进阶」三步法：第一步先花1-2个月打基础，第二步通过3-5个小项目积累经验，第三步针对目标岗位做定向提升。我们的任务队列就是按照这个逻辑设计的，你跟着完成就能稳步提升。`,
      ],
      resume: [
        () => `简历确实很关键！很多同学简历写不好，不是能力不行，而是不知道HR想看什么。我们的「理想简历」功能会生成目标岗位的优秀简历样板，把你需要达到的标准清晰标出来，你可以对照着一项项补齐。完成平台任务后的项目经历也可以直接写进简历，帮你积累真实作品。`,
        () => `想提升简历竞争力，核心是要有「人无我有，人有我优」的内容。对于你目标的${JOB_TAGS_MAP[getTopTag()]?.title || '岗位'}来说，2-3个能体现你能力的项目经历是必须的。我们平台的任务成果物都可以作为项目经历，AI还会帮你优化简历描述，让你的简历通过率大大提高。`,
        () => `简历优化我给你三个小建议：1. 一定要用STAR法则描述项目经历；2. 能量化的成果尽量量化；3. 针对不同岗位微调简历重点。这些技巧我们平台都会教你，而且「理想简历」会给你完整的参考模板，告诉你每个部分该怎么写，照着做就能写出高质量简历。`,
      ],
      interview: [
        () => `面试准备宜早不宜迟！我们平台有AI模拟面试功能，会根据${JOB_TAGS_MAP[getTopTag()]?.title || '目标岗位'}的真实面试题来提问，还会对你的回答给出反馈，帮你查漏补缺。建议你在技能掌握到60%左右就可以开始尝试模拟面试，在实战中发现问题。`,
        () => `准备面试其实有技巧的！技术面试一般分为基础知识、项目深挖、算法题、行为面试这几个部分。我们的AI面试官会覆盖所有这些环节，而且会记录你的每次面试表现，告诉你哪些地方需要改进。很多同学用这个功能练习后，真实面试时都不那么紧张了。`,
        () => `理解你想提前准备面试的心情！不过我建议你先把基础技能和项目经验积累好，再系统准备面试效果会更好。当然，你随时可以在平台里进行模拟面试，AI会根据你的目标岗位生成定制化面试题，还会给你答题思路和改进建议。`,
      ],
      suggestion: [
        () => `我给你几个入门建议吧：第一，不要贪多，选定一个方向先深入进去；第二，一定要多动手实践，光看视频不动手是学不会的；第三，多关注行业动态，了解目标岗位的最新要求。进入工作台后，系统会帮你把这些都落实到每日任务里，你只要跟着走就行。`,
        () => `还有个小建议：学习过程中注意积累作品，不管是小demo还是完整项目，都保存好，找工作的时候这些就是你最好的证明。我们平台每完成一个任务都会产出可展示的成果物，帮你逐步搭建自己的作品集。另外遇到问题也不用担心，AI学习助手7x24小时帮你解答。`,
        () => `最后提醒你一点：职业规划不是一蹴而就的，需要持续迭代。我们平台会根据你的学习进度、任务完成情况、能力变化，动态调整你的学习路径和推荐内容，就像有个私教一直在身边指导你。现在准备好开始你的职业提升之旅了吗？🚀`,
      ],
      generic: [
        () => '好问题！进入工作台后你会发现更多惊喜，系统会根据你的使用习惯持续优化推荐。先去探索一下吧，有任何问题随时可以问我～',
        () => '你的想法我已经记录下来啦！个性化工作台正在为你准备中，里面会有更多针对性内容，等你去发现哦。',
        () => '这个问题等你进入工作台后就能找到答案啦！能力诊断、任务体系、理想简历这些功能都会帮到你。',
      ]
    };

    function getTopTag() {
      const tags = Array.from(obSelectedTags);
      for (const tag of tags) {
        if (JOB_TAGS_MAP[tag]) return tag;
      }
      for (const [key] of Object.entries(JOB_TAGS_MAP)) {
        if (tags.some(t => key.includes(t) || t.includes(key))) return key;
      }
      return '前端开发';
    }

    function pickRandom(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    function typeWriter(element, text, speed = 25, callback) {
      let i = 0;
      element.innerHTML = '';
      const timer = setInterval(() => {
        if (i < text.length) {
          element.innerHTML += text.charAt(i);
          i++;
          const chat = document.getElementById('ai-chat');
          chat.scrollTop = chat.scrollHeight;
        } else {
          clearInterval(timer);
          if (callback) callback();
        }
      }, speed);
    }

    function addTypingIndicator() {
      const chat = document.getElementById('ai-chat');
      const typingId = 'ai-typing-' + Date.now();
      chat.innerHTML += '<div id="' + typingId + '" class="ai-msg bot"><div class="ai-avatar bot"><i class="fa-solid fa-robot"></i></div><div class="ai-bubble typing-indicator"><span></span><span></span><span></span></div></div>';
      chat.scrollTop = chat.scrollHeight;
      return typingId;
    }

    function removeTypingIndicator(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    function initAIChat() {
      const chat = document.getElementById('ai-chat');
      chat.innerHTML = '';
      aiChatReplyCount = 0;
      aiChatHistory = [];
      setTimeout(() => {
        const greeting = pickRandom(aiResponsePool.greetings);
        const identityLine = pickRandom(aiResponsePool.identityAnalysis)();
        const tagLine = pickRandom(aiResponsePool.tagAnalysis)();
        const firstMsg = greeting + '\n\n' + identityLine + '\n\n' + tagLine + '\n\n有什么想了解的吗？尽管问我吧～';
        
        const typingId = addTypingIndicator();
        setTimeout(() => {
          removeTypingIndicator(typingId);
          const msgId = 'ai-msg-' + Date.now();
          chat.innerHTML += '<div class="ai-msg bot"><div class="ai-avatar bot"><i class="fa-solid fa-robot"></i></div><div class="ai-bubble" id="' + msgId + '"></div></div>';
          typeWriter(document.getElementById(msgId), firstMsg, 20, () => {
            setTimeout(() => showQuickReplies(), 300);
          });
        }, 800 + Math.random() * 600);
      }, 500);
    }

    function showQuickReplies(customReplies) {
      const replies = document.getElementById('ai-replies');
      let buttons;
      if (customReplies) {
        buttons = customReplies;
      } else if (aiChatReplyCount === 0) {
        buttons = ['想了解适合什么岗位', '不知道该学什么技能', '想提升简历竞争力', '想准备面试'];
      } else {
        buttons = ['还有其他建议吗', '这个方向前景如何', '入门需要多久', '我明白了，开始探索'];
      }
      replies.innerHTML = '<div class="ai-quick-replies">' +
        buttons.map(text => {
          if (text.includes('开始探索')) {
            return '<span class="ai-quick-reply primary" onclick="document.querySelector(\'#ob-step-2 .btn-primary\').click()">' + text + '</span>';
          }
          return '<span class="ai-quick-reply" onclick="sendUserMessage(\'' + text + '\')">' + text + '</span>';
        }).join('') +
      '</div>';
      const chat = document.getElementById('ai-chat');
      setTimeout(() => chat.scrollTop = chat.scrollHeight, 50);
    }

    function addUserMsg(text) {
      const chat = document.getElementById('ai-chat');
      chat.innerHTML += '<div class="ai-msg user"><div class="ai-avatar human"><i class="fa-solid fa-user"></i></div><div class="ai-bubble">' + text + '</div></div>';
      chat.scrollTop = chat.scrollHeight;
    }

    async function sendUserMessage(presetText) {
      const input = document.getElementById('ai-chat-input');
      const text = presetText || (input ? input.value.trim() : '');
      if (!text) return;
      
      addUserMsg(text);
      if (input) input.value = '';
      document.getElementById('ai-replies').innerHTML = '';
      
      const typingId = addTypingIndicator();
      
      let response = '';
      if (proxyAvailable || AI_CONFIG.apiKey) {
        const apiReply = await callAIAPI(text);
        response = apiReply || getFallbackResponse(text);
      } else {
        await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
        response = getFallbackResponse(text);
      }
      
      removeTypingIndicator(typingId);
      
      aiChatReplyCount++;
      const msgId = 'ai-msg-' + Date.now();
      const chat = document.getElementById('ai-chat');
      chat.innerHTML += '<div class="ai-msg bot"><div class="ai-avatar bot"><i class="fa-solid fa-robot"></i></div><div class="ai-bubble" id="' + msgId + '"></div></div>';
      chat.scrollTop = chat.scrollHeight;
      
      typeWriter(document.getElementById(msgId), response, 15 + Math.random() * 15, () => {
        setTimeout(() => {
          if (aiChatReplyCount <= 3) {
            showQuickReplies();
          } else {
            showQuickReplies(['还有问题想问', '我明白了，开始探索']);
          }
        }, 400);
      });
    }

    const JOB_TAGS_MAP = {
      '前端开发': { title: '前端开发工程师', tags: ['React', 'Vue', 'TypeScript', 'Web性能'], color: '#6d5ef6' },
      '后端开发': { title: '后端开发工程师', tags: ['Java', 'Go', '微服务', 'MySQL'], color: '#10B981' },
      '移动开发': { title: '移动开发工程师', tags: ['Flutter', 'React Native', 'iOS', 'Android'], color: '#0ea5b7' },
      '算法/AI': { title: 'AI算法工程师', tags: ['Python', '机器学习', '深度学习', 'PyTorch'], color: '#F59E0B' },
      '数据开发': { title: '数据开发工程师', tags: ['Spark', 'Flink', 'Hadoop', 'SQL'], color: '#8B5CF6' },
      '游戏开发': { title: '游戏开发工程师', tags: ['Unity', 'Unreal', 'C#', '图形学'], color: '#EF4444' },
      '网络安全': { title: '安全工程师', tags: ['渗透测试', '逆向工程', '密码学', '安全审计'], color: '#1F2937' },
      '嵌入式开发': { title: '嵌入式开发工程师', tags: ['C/C++', 'RTOS', '单片机', 'Linux驱动'], color: '#065F46' },
      'UI/UX 设计': { title: 'UI/UX 设计师', tags: ['Figma', 'Sketch', '交互设计', '用户研究'], color: '#EC4899' },
      '视觉设计': { title: '视觉设计师', tags: ['Photoshop', 'Illustrator', '品牌设计', '平面设计'], color: '#F472B6' },
      '交互设计': { title: '交互设计师', tags: ['Figma', '原型设计', '用户体验', '动效设计'], color: '#A855F7' },
      '3D/动效': { title: '3D动效设计师', tags: ['Blender', 'C4D', 'Three.js', 'AE动效'], color: '#7C3AED' },
      '游戏美术': { title: '游戏美术设计师', tags: ['原画', '3D建模', '角色设计', '场景设计'], color: '#DC2626' },
      '视频剪辑': { title: '视频剪辑师', tags: ['Premiere', 'AE', '达芬奇', '短视频'], color: '#EA580C' },
      '产品经理': { title: '产品经理', tags: ['需求分析', '用户调研', '原型设计', '数据分析'], color: '#2563EB' },
      '产品运营': { title: '产品运营专员', tags: ['用户运营', '活动策划', '数据运营', '内容运营'], color: '#0891B2' },
      '内容运营': { title: '内容运营专员', tags: ['内容创作', '新媒体', '文案策划', '社群运营'], color: '#059669' },
      '用户增长': { title: '用户增长专家', tags: ['A/B测试', '增长黑客', '用户留存', '转化优化'], color: '#D97706' },
      '市场营销': { title: '市场营销专员', tags: ['品牌营销', '市场推广', '广告投放', '活动策划'], color: '#E11D48' },
      '品牌策划': { title: '品牌策划专员', tags: ['品牌定位', '视觉传达', '活动策划', '内容营销'], color: '#7C3AED' },
      '数据分析': { title: '数据分析师', tags: ['SQL', 'Python', 'Excel', '数据可视化'], color: '#0EA5E9' },
      '商业分析': { title: '商业分析师', tags: ['行业研究', '财务分析', '市场分析', '战略规划'], color: '#059669' },
      '金融/投行': { title: '金融分析师', tags: ['财务建模', '估值', '行业研究', 'CFA'], color: '#1E40AF' },
      '咨询': { title: '咨询顾问', tags: ['战略咨询', '管理咨询', '行业分析', 'PPT'], color: '#16A34A' },
      '人力资源': { title: 'HR专员', tags: ['招聘', '培训', '绩效管理', '员工关系'], color: '#DB2777' },
      '财务会计': { title: '财务会计', tags: ['会计准则', '财务报表', '税务', '审计'], color: '#CA8A04' },
    };

    const AVATARS = [
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&h=160&fit=crop&crop=faces',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&crop=faces',
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&h=160&fit=crop&crop=faces',
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=160&h=160&fit=crop&crop=faces',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&h=160&fit=crop&crop=faces',
    ];

    function generatePersonalizedAccount() {
      const tags = Array.from(obSelectedTags);
      let primaryTag = tags[0] || '前端开发';
      let jobInfo = JOB_TAGS_MAP[primaryTag];
      
      if (!jobInfo) {
        for (const [key, val] of Object.entries(JOB_TAGS_MAP)) {
          if (tags.some(t => t.includes(key) || key.includes(t))) {
            primaryTag = key;
            jobInfo = val;
            break;
          }
        }
      }
      if (!jobInfo) jobInfo = JOB_TAGS_MAP['前端开发'];

      const identityMap = {
        '在校学生': { grade: '大三', match: 45, tasksPending: 5, tasksDone: 0 },
        '应届毕业生': { grade: '应届', match: 62, tasksPending: 4, tasksDone: 3 },
        '研硕博': { grade: '研二', match: 55, tasksPending: 4, tasksDone: 2 },
        '已工作想转行': { grade: '在职', match: 35, tasksPending: 6, tasksDone: 0 },
      };
      const identInfo = identityMap[obIdentity] || identityMap['在校学生'];
      
      // 保留用户上传的自定义头像（data:image 开头的是用户上传的）
      let avatar;
      if (currentAccount && currentAccount.avatar && currentAccount.avatar.startsWith('data:image')) {
        avatar = currentAccount.avatar;
      } else {
        avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      }
      
      const hour = new Date().getHours();
      let greeting = '早上好';
      if (hour >= 12 && hour < 18) greeting = '下午好';
      else if (hour >= 18) greeting = '晚上好';

      const newAccount = {
        id: 'new-' + Date.now(),
        name: document.getElementById('reg-name').value.trim() || '新同学',
        avatar: avatar,
        major: primaryTag.includes('设计') ? '数字媒体艺术' : (primaryTag.includes('产品') || primaryTag.includes('运营') || primaryTag.includes('市场') ? '工商管理' : (primaryTag.includes('金融') || primaryTag.includes('财务') || primaryTag.includes('咨询') || primaryTag.includes('人力') ? '经济学' : '计算机相关专业')),
        grade: identInfo.grade,
        target: jobInfo.title,
        email: (document.getElementById('reg-email').value.trim() || 'user').replace(/(.{2}).*(@.*)/, '$1***$2') || '新用户@职引未来',
        school: '你的学校',
        bio: `对${jobInfo.title}方向感兴趣，正在通过职引未来系统规划职业路径，目标是掌握${jobInfo.tags.slice(0, 2).join('、')}等核心技能。`,
        greeting: greeting,
        matchPercent: identInfo.match,
        gapPercent: 100 - identInfo.match,
        tasksPending: identInfo.tasksPending,
        tasksDone: identInfo.tasksDone,
        studyHours: 0,
        tags: tags,
        jobTags: jobInfo.tags,
        jobColor: jobInfo.color,
        isNewUser: true,
        joinDate: new Date().toISOString().split('T')[0],
      };

      currentAccount = newAccount;
      applyPersonalization(newAccount);
      return newAccount;
    }

    function applyPersonalization(a) {
      const hour = new Date().getHours();
      let greeting = '早上好';
      if (hour >= 12 && hour < 18) greeting = '下午好';
      else if (hour >= 18) greeting = '晚上好';

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
      const setSrc = (id, val) => { const el = document.getElementById(id); if (el) el.src = val; };
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

      // Generate initials avatar as fallback
      const makeInitialsAvatar = (name) => {
        if (!name) return '';
        const initials = name.length >= 2 ? name.slice(0, 2).toUpperCase() : name.charAt(0).toUpperCase();
        const colors = [
          ['#6D5EF6', '#0EA5B7'],
          ['#F59E0B', '#EF4444'],
          ['#10B981', '#0EA5B7'],
          ['#6D5EF6', '#EC4899'],
          ['#3B82F6', '#6D5EF6']
        ];
        const colorIdx = name.charCodeAt(0) % colors.length;
        const [c1, c2] = colors[colorIdx];
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
          <defs><linearGradient id="sg2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${c1}"/>
            <stop offset="100%" style="stop-color:${c2}"/>
          </linearGradient></defs>
          <rect width="80" height="80" rx="40" fill="url(#sg2)"/>
          <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Sora, sans-serif" font-size="32" font-weight="700" fill="white">${initials}</text>
        </svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      };

      setSrc('sidebar-avatar', a.avatar || makeInitialsAvatar(a.name));
      set('sidebar-name', a.name);
      set('sidebar-meta', a.major + ' · ' + a.grade);
      set('hero-greeting', a.greeting || greeting);
      set('hero-name', a.name);
      set('hero-target', a.target);
      set('hero-gap', a.gapPercent + '%');
      set('hero-tasks', a.tasksPending);

      set('profile-name', a.name);
      set('profile-meta', a.major + ' · ' + a.grade);
      set('profile-target', '目标：' + a.target);
      set('profile-email', a.email);

      setVal('form-username', a.name);
      setVal('form-email', document.getElementById('reg-email').value || 'user@example.com');
      setVal('form-school', a.school);
      setVal('form-major', a.major);
      setVal('form-grade', a.grade);
      setVal('form-target', a.target);
      setVal('form-bio', a.bio);

      const resumeTarget = document.getElementById('resume-target-job');
      if (resumeTarget) resumeTarget.textContent = a.target;
      const resumeTargetSub = document.getElementById('resume-target-job-sub');
      if (resumeTargetSub) resumeTargetSub.textContent = a.target;

      updateRecommendations(a);
      updateSkillGaps(a);
      updateTasks(a);
      updateDashboardStats(a);
    }

    function updateRecommendations(a) {
      const list = document.getElementById('recommend-list');
      if (!list) return;

      const companies = ['字节跳动', '腾讯', '阿里巴巴', '美团', '小红书', '网易', '百度', '京东'];
      const salaries = ['18-30K', '20-35K', '22-38K', '25-42K', '300-500/天'];
      const newJobs = [];
      
      for (let i = 0; i < 5; i++) {
        const match = Math.max(55, 92 - i * 8 + Math.floor(Math.random() * 6));
        const isIntern = a.grade === '大二' || a.grade === '大三';
        newJobs.push({
          title: isIntern && i >= 3 ? a.target.replace('工程师', '实习生') : a.target,
          company: companies[i % companies.length],
          match: match,
          salary: isIntern && i >= 3 ? salaries[4] : salaries[i % 4],
          tags: a.jobTags.slice(0, 3).map((t, idx) => idx === 0 ? t : a.jobTags[idx]),
          reason: i === 0 ? '与你选择的兴趣方向高度匹配，是你的首选目标岗位' :
                 i === 1 ? '该岗位核心技能与你的兴趣标签契合度高' :
                 i === 2 ? '建议补齐相关技能后投递，发展潜力大' :
                 isIntern ? '实习岗位，门槛适中，适合在校学生积累经验' :
                 '作为备选方向，技能栈有一定重合度',
        });
      }

      list.innerHTML = newJobs.map((j, i) => {
        const tier = j.match >= 80 ? '高度匹配' : (j.match >= 60 ? '较好匹配' : '潜力岗位');
        const tierColor = j.match >= 80 ? '#10B981' : (j.match >= 60 ? '#F59E0B' : '#6B7280');
        return '<div class="rounded-xl border border-content-divider p-4 hover:border-brand-purple hover:shadow-card-hover transition cursor-pointer" style="animation:fadeUp 0.5s ease ' + (i * 0.08) + 's backwards">' +
          '<div class="flex items-start justify-between gap-3 mb-2">' +
            '<div><div class="font-display font-bold text-base text-content-text">' + j.title + '</div>' +
            '<div class="text-[12px] text-content-sub mt-0.5">' + j.company + ' · ' + j.salary + '</div></div>' +
            '<div class="text-right"><div class="font-display font-extrabold text-xl" style="color:#7B4FE0">' + j.match + '%</div>' +
            '<span class="badge" style="background:' + tierColor + '20;color:' + tierColor + '">' + tier + '</span></div>' +
          '</div>' +
          '<div class="match-bar mb-2"><div class="match-fill" style="width:' + j.match + '%"></div></div>' +
          '<p class="text-[12px] text-content-sub mb-2"><i class="fa-solid fa-lightbulb text-brand-cyan mr-1"></i>' + j.reason + '</p>' +
          '<div class="flex flex-wrap gap-1.5">' + j.tags.map(t => '<span class="chip" style="font-size:11px;padding:2px 8px">' + t + '</span>').join('') + '</div>' +
        '</div>';
      }).join('');
    }

    function updateSkillGaps(a) {
      const gapsContainer = document.getElementById('skill-gaps-list');
      if (!gapsContainer) return;

      if (typeof window.renderSkillList === 'function') {
        window.renderSkillList('gap');
        if (typeof window.renderSkillTree === 'function') {
          window.renderSkillTree();
        }
        return;
      }

      const isNew = a.isNewUser;
      const skills = a.jobTags;
      const gapHtml = skills.slice(0, 5).map((skill, i) => {
        let mastered, status, badgeClass, dotClass, percent;
        if (isNew) {
          mastered = false;
          status = '待学习';
          badgeClass = 'badge-pending';
          dotClass = 'dot-missing';
          percent = 0;
        } else {
          mastered = i >= 3;
          status = mastered ? '已掌握' : (i === 0 ? '待提升' : '未掌握');
          badgeClass = mastered ? 'badge-passed' : (i === 0 ? 'badge-verifying' : 'badge-rejected');
          dotClass = mastered ? 'dot-mastered' : (i === 0 ? 'dot-improve' : 'dot-missing');
          percent = mastered ? (85 + Math.floor(Math.random() * 10)) : (i === 0 ? 55 + Math.floor(Math.random() * 10) : 10 + Math.floor(Math.random() * 20));
        }
        return '<div class="rounded-xl border border-content-divider p-4 hover:border-brand-purple transition">' +
          '<div class="flex items-center justify-between mb-1">' +
            '<div class="flex items-center gap-2">' +
              '<span class="dot ' + dotClass + '"></span>' +
              '<span class="font-semibold text-content-text">' + skill + '</span>' +
              '<span class="badge ' + badgeClass + '">' + status + '</span>' +
            '</div>' +
            '<span class="text-[11px] text-content-sub">掌握度 ' + percent + '%</span>' +
          '</div>' +
          '<p class="text-[12px] text-content-sub">' + (isNew ? '完成诊断评估后了解你的当前水平' : (mastered ? '基础扎实，建议在实战中巩固' : '这是目标岗位的核心技能，建议优先学习')) + '</p>' +
        '</div>';
      }).join('');
      
      gapsContainer.innerHTML = gapHtml;
    }

    function updateRecentTasksCard(taskList) {
      const title1 = document.querySelector('.recent-task-title-1');
      const meta1 = document.querySelector('.recent-task-meta-1');
      const title2 = document.querySelector('.recent-task-title-2');
      const meta2 = document.querySelector('.recent-task-meta-2');
      const title3 = document.querySelector('.recent-task-title-3');
      const meta3 = document.querySelector('.recent-task-meta-3');
      
      if (taskList.length > 0 && title1 && meta1) {
        title1.textContent = '完成 ' + taskList[0];
        meta1.textContent = '预计 4h · 优先级高';
      }
      if (taskList.length > 1 && title2 && meta2) {
        title2.textContent = taskList[1] + ' 总结';
        meta2.textContent = '预计 2h · 优先级中';
      }
      if (taskList.length > 2 && title3 && meta3) {
        title3.textContent = taskList[2];
        meta3.textContent = currentAccount.tasksDone > 0 ? 'AI 正在评估成果物' : '待解锁';
      }
    }

    function updateTasks(a) {
      const tasksContainer = document.getElementById('task-queue-list');
      if (!tasksContainer) return;

      const taskMeta = {
        '前端开发工程师': [
          { title: 'React Hooks 基础实战', key: 'react-hooks', type: 'A' },
          { title: 'TypeScript 类型入门', key: 'typescript', type: 'A' },
          { title: '前端工程化配置实践', key: 'vite', type: 'A' },
        ],
        '后端开发工程师': [
          { title: 'Spring Boot 入门项目', key: 'spring-boot', type: 'A' },
          { title: 'MySQL 索引优化实战', key: 'mysql-index', type: 'A' },
          { title: 'RESTful API 设计', key: 'rest-api', type: 'A' },
        ],
        'AI算法工程师': [
          { title: 'Python 数据分析基础', key: 'python-data', type: 'A' },
          { title: '机器学习入门项目', key: 'ml-intro', type: 'A' },
          { title: 'PyTorch 神经网络实践', key: 'pytorch-nn', type: 'A' },
        ],
        'UI/UX 设计师': [
          { title: 'Figma 组件库搭建', key: 'figma-components', type: 'A' },
          { title: '用户调研报告撰写', key: 'ux-report', type: 'B' },
          { title: '移动端交互原型设计', key: 'mobile-prototype', type: 'A' },
        ],
        '产品经理': [
          { title: '需求文档(PRD)撰写', key: 'prd-write', type: 'B' },
          { title: '用户访谈实践', key: 'user-interview', type: 'B' },
          { title: '竞品分析报告', key: 'competitor-analysis', type: 'B' },
        ],
        '数据分析师': [
          { title: 'SQL 复杂查询实战', key: 'sql-query', type: 'A' },
          { title: 'Excel 数据透视表', key: 'excel-pivot', type: 'B' },
          { title: 'Python 数据可视化', key: 'python-viz', type: 'A' },
        ],
      };

      // ==== 动态渲染统计卡片（基于用户数据） ====
      const isNewUser = !a.tasksDone || a.tasksDone === 0;
      const progressCount = isNewUser ? 0 : 1;
      const verifyingCount = isNewUser ? 0 : 1;
      const passedCount = a.tasksDone || 0;
      const rejectedCount = isNewUser ? 0 : 1;
      // 待开始：新用户显示3个推荐任务，老用户显示2个待办
      const pendingCount = isNewUser ? 3 : 2;

      const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setStat('task-stat-pending', pendingCount);
      setStat('task-stat-progress', progressCount);
      setStat('task-stat-verifying', verifyingCount);
      setStat('task-stat-passed', passedCount);
      setStat('task-stat-rejected', rejectedCount);

      // ==== 动态渲染任务依赖链 ====
      const chainContent = document.getElementById('task-chain-content');
      if (chainContent) {
        const tasks = taskMeta[a.target] || taskMeta['前端开发工程师'];
        const totalNodes = Math.min(tasks.length + 2, 5);
        let chainHtml = '';
        
        if (isNewUser) {
          // 新用户：显示初始化引导
          chainHtml = '<div class="flex items-center justify-center py-4">' +
            '<div class="text-center">' +
              '<div class="text-2xl mb-2">🚀</div>' +
              '<div class="font-display font-bold text-sm text-content-text mb-1">完成第一个任务，解锁成长路径</div>' +
              '<div class="text-[11px] text-content-sub">完成任务后，这里会显示你的技能成长链路</div>' +
            '</div>' +
          '</div>';
        } else {
          chainHtml = '<div class="flex items-center justify-between mb-4">' +
            '<div class="flex items-center gap-2">' +
              '<i class="fa-solid fa-diagram-project text-brand-purple"></i>' +
              '<span class="font-display font-bold text-sm text-content-text">任务依赖链</span>' +
              '<span class="text-[11px] text-content-sub">完成前置任务可自动解锁后续</span>' +
            '</div>' +
            '<span class="text-[11px] text-content-sub">共 ' + totalNodes + ' 个节点 · ' + Math.max(1, totalNodes - 2) + ' 条依赖路径</span>' +
          '</div>' +
          '<div class="flex items-center gap-0 overflow-x-auto pb-2" style="scroll-behavior:smooth">';
          
          for (let i = 0; i < totalNodes; i++) {
            const nodeIndex = i;
            const isCompleted = nodeIndex < a.tasksDone;
            const isCurrent = nodeIndex === a.tasksDone;
            const isLocked = nodeIndex > a.tasksDone + 1;
            const task = tasks[nodeIndex] || { title: '进阶任务', key: 'advanced-' + nodeIndex };
            
            let nodeHtml = '';
            if (isCompleted) {
              nodeHtml = '<div class="flex-shrink-0 flex flex-col items-center" style="min-width:120px">' +
                '<div class="w-11 h-11 rounded-full flex items-center justify-center mb-1.5" style="background:rgba(16,185,129,0.15);border:2px solid rgba(16,185,129,0.4)">' +
                  '<i class="fa-solid fa-check text-state-success text-sm"></i>' +
                '</div>' +
                '<div class="text-[10px] font-semibold text-state-success">已完成</div>' +
                '<div class="text-[10px] text-content-sub mt-0.5 text-center leading-tight">' + task.title + '</div>' +
              '</div>';
            } else if (isCurrent) {
              nodeHtml = '<div class="flex-shrink-0 flex flex-col items-center" style="min-width:120px">' +
                '<div class="w-11 h-11 rounded-full flex items-center justify-center mb-1.5" style="background:rgba(0,184,212,0.15);border:2px solid rgba(0,184,212,0.5);animation:chainPulse 2s ease-in-out infinite">' +
                  '<i class="fa-solid fa-code text-brand-cyan text-sm"></i>' +
                '</div>' +
                '<div class="text-[10px] font-semibold text-brand-cyan">进行中</div>' +
                '<div class="text-[10px] text-content-text mt-0.5 text-center leading-tight">' + task.title + '</div>' +
              '</div>';
            } else if (isLocked) {
              nodeHtml = '<div class="flex-shrink-0 flex flex-col items-center" style="min-width:120px">' +
                '<div class="w-11 h-11 rounded-full flex items-center justify-center mb-1.5" style="background:#f1f5f9;border:2px solid #e2e8f0">' +
                  '<i class="fa-solid fa-lock text-content-sub text-sm"></i>' +
                '</div>' +
                '<div class="text-[10px] font-semibold text-content-sub">待解锁</div>' +
                '<div class="text-[10px] text-content-sub mt-0.5 text-center leading-tight">' + task.title + '</div>' +
              '</div>';
            } else {
              nodeHtml = '<div class="flex-shrink-0 flex flex-col items-center" style="min-width:120px">' +
                '<div class="w-11 h-11 rounded-full flex items-center justify-center mb-1.5" style="background:rgba(148,163,184,0.12);border:2px dashed rgba(148,163,184,0.4)">' +
                  '<i class="fa-solid fa-hourglass-half text-content-sub text-sm"></i>' +
                '</div>' +
                '<div class="text-[10px] font-semibold text-content-sub">待开始</div>' +
                '<div class="text-[10px] text-content-sub mt-0.5 text-center leading-tight">' + task.title + '</div>' +
              '</div>';
            }
            
            if (i > 0) {
              chainHtml += '<div class="flex-shrink-0 mx-1 flex flex-col items-center pt-4">' +
                '<div style="width:40px;height:2px;background:' + (isCompleted ? 'linear-gradient(90deg,#10b981,#0ea5b7)' : isCurrent ? 'linear-gradient(90deg,#00b8d4,#94a3b8)' : 'linear-gradient(90deg,#94a3b8,#cbd5e1)') + ';border-radius:2px"></div>' +
              '</div>';
            }
            chainHtml += nodeHtml;
          }
          
          chainHtml += '</div>';
        }
        chainContent.innerHTML = chainHtml;
      }

      // ==== 动态渲染任务卡片 ====
      let tasks = taskMeta[a.target] || taskMeta['前端开发工程师'];
      if (a.tasksDone > 0 && !isNewUser) {
        tasks = tasks.slice(a.tasksDone).concat([
          { title: '项目复盘总结', key: 'review', type: 'B' },
          { title: '简历优化迭代', key: 'resume-opt', type: 'B' },
        ]);
      }
      
      updateRecentTasksCard(tasks.map(t => t.title));

      const taskCards = tasks.slice(0, 4).map((task, i) => {
        const isLocked = i > 1;
        let statusText, badgeClass, dataStatus;
        if (isLocked) {
          statusText = '未解锁';
          badgeClass = 'badge-pending';
          dataStatus = 'locked';
        } else if (isNewUser && i === 0) {
          statusText = '待开始';
          badgeClass = 'badge-pending';
          dataStatus = 'pending';
        } else {
          statusText = i === 0 ? '进行中' : '待开始';
          badgeClass = i === 0 ? 'badge-progress' : 'badge-pending';
          dataStatus = i === 0 ? 'progress' : 'pending';
        }
        const priority = i === 0 ? '优先级高' : '优先级中';
        const priorityColor = i === 0 ? 'rgba(239,68,68,0.1)' : 'rgba(107,130,80,0.1)';
        const priorityTextColor = i === 0 ? '#c2333a' : '#4d7c0f';
        const iconBg = i === 0 ? 'rgba(0,184,212,0.1)' : 'rgba(15,12,41,0.06)';
        const iconColor = i === 0 ? '#00b8d4' : '#6b6b76';
        const icon = isLocked ? 'fa-lock' : (i === 0 ? 'fa-code' : 'fa-pen-nib');
        const hours = [4, 6, 2, 8][i] || 4;
        const typeLabel = task.type === 'A' ? 'A 类' : 'B 类';

        if (isLocked) {
          return '<div class="card p-5 opacity-60" data-status="' + dataStatus + '">' +
            '<div class="flex items-start gap-4">' +
              '<div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#eef0f4">' +
                '<i class="fa-solid ' + icon + ' text-content-sub text-lg"></i>' +
              '</div>' +
              '<div class="flex-1 min-w-0">' +
                '<div class="flex items-center gap-2 mb-1 flex-wrap">' +
                  '<h3 class="font-display font-bold text-base text-content-sub">' + task.title + '</h3>' +
                  '<span class="badge ' + badgeClass + '">' + statusText + '</span>' +
                '</div>' +
                '<p class="text-[13px] text-content-sub mb-2">完成前序任务后自动解锁</p>' +
              '</div>' +
            '</div>' +
          '</div>';
        }

        return '<div class="card card-hover p-5" data-status="' + dataStatus + '">' +
          '<div class="flex items-start gap-4">' +
            '<div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style="background:' + iconBg + '">' +
              '<i class="fa-solid ' + icon + ' text-lg" style="color:' + iconColor + '"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex items-center gap-2 mb-1 flex-wrap">' +
                '<h3 class="font-display font-bold text-base text-content-text">' + task.title + '</h3>' +
                '<span class="badge ' + badgeClass + '">' + statusText + '</span>' +
                '<span class="badge badge-purple">' + typeLabel + '</span>' +
                '<span class="badge" style="background:' + priorityColor + ';color:' + priorityTextColor + '">' + priority + '</span>' +
              '</div>' +
              '<p class="text-[13px] text-content-sub mb-2">基于你的兴趣标签和目标岗位 ' + a.target + ' 推荐的入门任务，预计 ' + hours + 'h 完成</p>' +

              '<div class="rounded-lg p-2.5 mb-2" style="background:rgba(109,94,246,0.04);border:1px solid rgba(109,94,246,0.12)">' +
                '<div class="flex items-center gap-1.5 mb-1">' +
                  '<i class="fa-solid fa-book-open text-brand-purple text-[11px]"></i>' +
                  '<span class="text-[11px] font-semibold text-content-text">学习笔记大纲</span>' +
                '</div>' +
                '<div class="flex flex-wrap gap-1.5">' +
                  '<span class="text-[11px] px-1.5 py-0.5 rounded" style="background:#f1f5f9;color:#475569">① 核心概念</span>' +
                  '<span class="text-[11px] px-1.5 py-0.5 rounded" style="background:#f1f5f9;color:#475569">② 实战练习</span>' +
                  '<span class="text-[11px] px-1.5 py-0.5 rounded" style="background:#f1f5f9;color:#475569">③ 进阶技巧</span>' +
                '</div>' +
              '</div>' +

              '<div class="rounded-lg p-2.5 mb-2" style="background:rgba(14,165,183,0.04);border:1px solid rgba(14,165,183,0.12)">' +
                '<div class="flex items-center gap-1.5 mb-1">' +
                  '<i class="fa-brands fa-github text-brand-cyan text-[11px]"></i>' +
                  '<span class="text-[11px] font-semibold text-content-text">GitHub 模板仓库</span>' +
                '</div>' +
                '<div class="flex items-center gap-2 flex-wrap">' +
                  '<a href="#" class="text-[11px] text-brand-cyan hover:underline"><i class="fa-solid fa-link mr-0.5"></i>' + task.key + '-starter</a>' +
                  '<span class="text-[10px] text-content-sub">· 含目录结构 + 基础配置</span>' +
                '</div>' +
              '</div>' +

              '<div class="flex items-center gap-4 text-[11px] text-content-sub">' +
                '<span><i class="fa-regular fa-clock mr-1"></i>预计 ' + hours + 'h</span>' +
                '<span><i class="fa-solid fa-list-check mr-1"></i>成果物：学习笔记或可运行项目</span>' +
              '</div>' +
            '</div>' +
            '<div class="flex flex-col gap-2 flex-shrink-0">' +
              '<button class="btn-primary px-4 py-2 rounded-lg text-xs" onclick="openSubmitModal(\'' + task.title + '\',\'' + task.type + '\')"><i class="fa-solid fa-upload mr-1.5"></i>提交成果物</button>' +
              '<button class="btn-ghost px-4 py-2 rounded-lg text-xs" onclick="openTaskDetail(\'' + task.key + '\')">查看详情</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      const emptyState = '<div class="empty-state" id="task-empty-state" style="display:none;">' +
        '<div class="empty-state-illustration"><i class="fa-solid fa-inbox"></i></div>' +
        '<div class="empty-state-title">当前筛选条件下暂无任务</div>' +
        '<div class="empty-state-desc">尝试调整筛选条件，或刷新队列获取新的 AI 派发任务。</div>' +
        '<button class="empty-state-btn" onclick="refreshQueue()"><i class="fa-solid fa-rotate mr-1"></i>刷新任务队列</button>' +
      '</div>';

      tasksContainer.innerHTML = taskCards + emptyState;

      // ==== 重新应用筛选状态 ====
      if (activeTaskFilter) {
        applyTaskFilter(activeTaskFilter);
      }

      // ==== 动态渲染历史区域 ====
      const historySection = document.getElementById('task-history-section');
      const historyContent = document.getElementById('history-content');
      if (historySection && historyContent) {
        if (isNewUser || passedCount === 0) {
          // 新用户或无已通过任务：显示空状态
          historyContent.innerHTML = '<div class="empty-state text-center py-6">' +
            '<div class="empty-state-illustration"><i class="fa-solid fa-clock-rotate-left"></i></div>' +
            '<div class="empty-state-title">暂无历史记录</div>' +
            '<div class="empty-state-desc">完成第一个任务并提交成果物后，历史记录将在这里显示</div>' +
          '</div>';
          const countSpan = historySection.querySelector('.fa-clock-rotate-left');
          if (countSpan) {
            const countText = countSpan.parentElement;
            if (countText) countText.innerHTML = '<i class="fa-solid fa-clock-rotate-left mr-1"></i>共 0 条历史';
          }
        } else {
          // 有历史记录：更新计数
          const countSpan = historySection.querySelector('.fa-clock-rotate-left');
          if (countSpan) {
            const countText = countSpan.parentElement;
            if (countText) countText.innerHTML = '<i class="fa-solid fa-clock-rotate-left mr-1"></i>共 ' + (passedCount + verifyingCount + rejectedCount) + ' 条历史';
          }
        }
      }
    }

    function updateDashboardStats(a) {
      const isNew = a.isNewUser;
      
      const matchEl = document.querySelector('.stat-match');
      if (matchEl) {
        matchEl.innerHTML = a.matchPercent + '<span class="text-lg text-content-sub">%</span>';
      }
      const matchBar = document.querySelector('.stat-match-bar');
      if (matchBar) {
        matchBar.style.width = a.matchPercent + '%';
      }
      const matchLabel = document.querySelector('.stat-match-label');
      if (matchLabel) {
        matchLabel.textContent = isNew ? '首次匹配评估' : '当前匹配度';
      }
      const matchGoal = document.querySelector('.stat-match-goal');
      if (matchGoal) {
        const target = Math.min(100, Math.round(a.matchPercent + 5));
        matchGoal.textContent = isNew ? '完成评估即可解锁' : '距离目标 ' + target + '%';
      }
      const matchDelta = document.querySelector('.stat-match-delta');
      if (matchDelta) {
        matchDelta.textContent = isNew ? '起步阶段' : '+5%';
      }
      
      const tasksDoneEl = document.querySelector('.stat-tasks-done');
      if (tasksDoneEl) {
        const total = isNew ? a.tasksPending : (a.tasksDone + a.tasksPending);
        tasksDoneEl.innerHTML = a.tasksDone + '<span class="text-lg text-content-sub">/' + total + '</span>';
      }
      const tasksWeek = document.querySelector('.stat-tasks-week');
      if (tasksWeek) {
        tasksWeek.textContent = isNew ? '待开始' : '0 个';
      }
      
      const hoursEl = document.querySelector('.stat-hours');
      if (hoursEl) {
        hoursEl.innerHTML = a.studyHours + '<span class="text-lg text-content-sub">h</span>';
      }
      const hoursMonth = document.querySelector('.stat-hours-month');
      if (hoursMonth) {
        hoursMonth.textContent = isNew ? '刚开始' : a.studyHours + 'h';
      }
      
      const gapsEl = document.querySelector('.stat-gaps');
      if (gapsEl) {
        const total = a.jobTags.length;
        const mastered = isNew ? 0 : Math.max(3, Math.floor(total * 0.4));
        gapsEl.innerHTML = mastered + '<span class="text-lg text-content-sub">/' + total + '</span>';
      }
      const gapsCount = document.querySelector('.stat-gaps-count');
      if (gapsCount) {
        const needImprove = isNew ? a.jobTags.length : Math.ceil(a.jobTags.length * 0.6);
        gapsCount.textContent = needImprove + ' 项';
      }

      // P2：空状态引导——tasksDone === 0 时在趋势图区域插入引导文案
      renderTrendEmptyState(a);

      if (chartsInit.dashboard) {
        updateChartsWithAccount(a);
      }
      updateTasks(a);
    }

    // ============ 空状态引导（趋势图区域） ============
    // 当 currentAccount.tasksDone === 0 时，在 Dashboard 的"匹配度趋势"卡片内
    // 插入一段引导文案，避免新用户看到空荡荡的曲线产生空洞感
    function renderTrendEmptyState(a) {
      const card = document.getElementById('trend-chart-card');
      if (!card) return;
      // 引导区块的容器 id，避免重复插入
      let emptyEl = document.getElementById('trend-empty-guide');
      const hasNoTasks = !a || !a.tasksDone || a.tasksDone === 0;
      if (hasNoTasks) {
        if (!emptyEl) {
          emptyEl = document.createElement('div');
          emptyEl.id = 'trend-empty-guide';
          emptyEl.style.cssText = 'margin: 16px 0; padding: 20px; background: linear-gradient(135deg,rgba(109,94,246,0.06),rgba(14,165,183,0.04));border: 1px dashed rgba(109,94,246,0.3);border-radius: 12px; text-align: center;';
          emptyEl.innerHTML =
            '<div style="font-size: 28px; margin-bottom: 8px;">🚀</div>' +
            '<div style="font-size: 14px; font-weight: 600; color: #475569; margin-bottom: 4px;">完成第一个任务，开启你的成长曲线</div>' +
            '<div style="font-size: 12px; color: #94a3b8; margin-bottom: 12px;">任务通过后，这里会显示你的匹配度提升轨迹</div>' +
            '<button class="btn-primary px-4 py-2 rounded-lg text-xs" onclick="switchPage(\'tasks\')" style="background:#6d5ef6;color:#fff;border:none;cursor:pointer;">去任务中心 →</button>';
          // 插入到 chart-trend 元素前面
          const chartEl = document.getElementById('chart-trend');
          if (chartEl) {
            chartEl.parentNode.insertBefore(emptyEl, chartEl);
          } else {
            card.appendChild(emptyEl);
          }
        }
        emptyEl.style.display = '';
      } else {
        // 已有任务通过 → 隐藏引导
        if (emptyEl) emptyEl.style.display = 'none';
      }
    }

    // ============ PROFILE: 动态渲染技能进度条 ============
    function renderProfileSkillBars(a) {
      const container = document.getElementById('profile-skill-bars');
      if (!container) return;
      
      const skills = a.jobTags || [];
      const isNew = a.isNewUser;
      
      if (skills.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-content-sub text-xs">暂无技能标签，请先完成职业规划</div>';
        return;
      }
      
      container.innerHTML = skills.map((skill, i) => {
        let percent, colorClass;
        if (isNew) {
          percent = 0;
          colorClass = 'text-content-sub';
        } else {
          const presets = [85, 72, 45, 90, 38, 55, 62, 48];
          percent = presets[i % presets.length] || Math.floor(Math.random() * 60) + 20;
          colorClass = percent >= 80 ? 'text-brand-purple' : (percent >= 60 ? 'text-brand-cyan' : 'text-state-warning');
        }
        const barColor = percent >= 80 ? 'from-brand-purple to-brand-cyan' : (percent >= 60 ? 'from-brand-purple to-brand-cyan' : 'from-amber-400 to-brand-cyan');
        
        return '<div>' +
          '<div class="flex items-center justify-between text-[12px] mb-1">' +
            '<span class="text-content-text font-medium">' + skill + '</span>' +
            '<span class="font-display font-bold ' + colorClass + '">' + percent + '%</span>' +
          '</div>' +
          '<div class="h-1.5 bg-content-bg rounded-full overflow-hidden">' +
            '<div class="h-full rounded-full bg-gradient-to-r ' + barColor + '" style="width:' + percent + '%"></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // ============ PROFILE: 动态渲染目标岗位匹配分析卡片 ============
    function renderProfileGoalCard(a) {
      const card = document.getElementById('profile-goal-card');
      if (!card) return;
      
      const isNew = a.isNewUser;
      const target = a.target || '待规划';
      const match = a.matchPercent || 0;
      
      if (isNew) {
        card.innerHTML = 
          '<div class="flex items-center gap-2 mb-3">' +
            '<div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:linear-gradient(135deg,#6D5EF6,#0EA5B7)">' +
              '<i class="fa-solid fa-bullseye text-white text-xs"></i>' +
            '</div>' +
            '<h3 class="font-display font-bold text-sm text-content-text">目标岗位匹配分析</h3>' +
          '</div>' +
          '<p class="text-[12px] text-content-sub leading-relaxed mb-3">' +
            '完成职业规划和技能诊断后，AI 将为你生成个性化的岗位匹配分析。当前匹配度 ' +
            '<b class="text-brand-purple">' + match + '%</b>。' +
          '</p>' +
          '<div class="flex gap-2">' +
            '<button class="btn-primary px-3 py-1.5 rounded-lg text-[11px] flex-1" onclick="switchPage(\'planning\')"><i class="fa-solid fa-compass mr-1"></i>开始职业规划</button>' +
            '<button class="btn-ghost px-3 py-1.5 rounded-lg text-[11px]" onclick="switchPage(\'diagnosis\')"><i class="fa-solid fa-magnifying-glass-chart mr-1"></i>技能诊断</button>' +
          '</div>';
      } else {
        const gapAnalysis = a.gapPercent > 30 
          ? '建议重点补强相关技能' 
          : a.gapPercent > 15 
            ? '继续巩固优势技能'
            : '你已非常接近目标！';
        const topSkills = (a.jobTags || []).slice(0, 2);
        const skillsText = topSkills.length > 0 ? topSkills.join(' 和 ') : '核心技能';
        
        card.innerHTML = 
          '<div class="flex items-center gap-2 mb-3">' +
            '<div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:linear-gradient(135deg,#6D5EF6,#0EA5B7)">' +
              '<i class="fa-solid fa-bullseye text-white text-xs"></i>' +
            '</div>' +
            '<h3 class="font-display font-bold text-sm text-content-text">目标岗位匹配分析</h3>' +
          '</div>' +
          '<p class="text-[12px] text-content-sub leading-relaxed mb-3">' +
            '你的技能与 <b class="text-brand-purple">' + target + '</b> 岗位匹配度为 <b class="text-state-success">' + match + '%</b>，' +
            gapAnalysis + '，建议重点补强 <b class="text-state-warning">' + skillsText + '</b> 相关能力。' +
          '</p>' +
          '<div class="flex gap-2">' +
            '<button class="btn-primary px-3 py-1.5 rounded-lg text-[11px] flex-1" onclick="switchPage(\'tasks\')"><i class="fa-solid fa-list-check mr-1"></i>去补齐任务</button>' +
            '<button class="btn-ghost px-3 py-1.5 rounded-lg text-[11px]" onclick="switchPage(\'market\')"><i class="fa-solid fa-briefcase mr-1"></i>查看岗位</button>' +
          '</div>';
      }
    }

    // ============ PROGRESS DASHBOARD (collapsible side panel) ============
    let progressDashboardOpen = false;

    function toggleProgressDashboard() {
      const panel = document.getElementById('progress-dashboard-panel');
      const overlay = document.getElementById('progress-dashboard-overlay');
      if (!panel) {
        const page = document.getElementById('page-dashboard');
        if (!page) return;
        const existingOverlay = document.getElementById('progress-dashboard-overlay');
        const existingPanel = document.getElementById('progress-dashboard-panel');
        if (existingOverlay) existingOverlay.remove();
        if (existingPanel) existingPanel.remove();
        const newOverlay = document.createElement('div');
        newOverlay.id = 'progress-dashboard-overlay';
        newOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:90;display:none;';
        newOverlay.onclick = toggleProgressDashboard;
        document.body.appendChild(newOverlay);
        const newPanel = document.createElement('div');
        newPanel.id = 'progress-dashboard-panel';
        newPanel.style.cssText = 'position:fixed;top:0;right:0;width:360px;height:100%;background:#fff;z-index:95;box-shadow:-4px 0 24px rgba(0,0,0,0.12);transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column;';
        newPanel.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #f0f1f5;">' +
          '<div><div style="font-weight:700;color:#1a1a2e;font-size:15px;">职业进度仪表盘</div><div style="font-size:11px;color:#6b7280;margin-top:2px;">实时追踪你的成长轨迹</div></div>' +
          '<button onclick="toggleProgressDashboard()" style="border:none;background:none;cursor:pointer;font-size:18px;color:#6b7280;"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>' +
          '<div style="flex:1;overflow-y:auto;padding:16px 20px;">' +
          '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">整体进度</div>' +
          '<div style="background:#f7f7f9;border-radius:12px;padding:14px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><span style="font-size:12px;color:#6b7280;">匹配度达成</span><span style="font-weight:700;color:#7b4fe0;font-size:18px;">' + (currentAccount.matchPercent || 0) + '%</span></div>' +
          '<div style="height:6px;background:#e8e8ec;border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + (currentAccount.matchPercent || 0) + '%;background:linear-gradient(90deg,#7b4fe0,#0ea5b7);border-radius:3px;"></div></div>' +
          '</div></div>' +
          '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">学习数据</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<div style="background:#f0fdf4;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#10b981;">' + (currentAccount.tasksDone || 0) + '</div><div style="font-size:11px;color:#059669;">已完成任务</div></div>' +
          '<div style="background:#fef3c7;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#d97706;">' + (currentAccount.studyHours || 0) + 'h</div><div style="font-size:11px;color:#b45309;">学习时长</div></div>' +
          '</div></div>' +
          '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">技能掌握</div>' +
          '<div style="display:flex;flex-wrap;gap:6px;">' + (currentAccount.jobTags || []).slice(0, 8).map(tag => '<span style="padding:4px 10px;border-radius:9999px;font-size:11px;background:rgba(109,94,246,0.1);color:#6d5ef6;">' + tag + '</span>').join('') + '</div></div>' +
          '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">最近成就</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;"><div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f7f7f9;border-radius:8px;font-size:12px;"><i class="fa-solid fa-check text-state-success"></i><span>完成了 ' + (currentAccount.tasksDone || 0) + ' 个任务</span></div><div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f7f7f9;border-radius:8px;font-size:12px;"><i class="fa-solid fa-clock text-brand-cyan"></i><span>累计学习 ' + (currentAccount.studyHours || 0) + ' 小时</span></div><div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f7f7f9;border-radius:8px;font-size:12px;"><i class="fa-solid fa-bullseye text-brand-purple"></i><span>目标：' + (currentAccount.target || '未设置') + '</span></div></div></div>' +
          '</div>' +
          '<div style="padding:14px 20px;border-top:1px solid #f0f1f5;"><button class="btn-primary" style="width:100%;" onclick="switchPage(\'diagnosis\');toggleProgressDashboard();"><i class="fa-solid fa-chart-simple mr-1.5"></i>查看详细诊断报告</button></div>';
        document.body.appendChild(newPanel);
        if (newOverlay && newPanel) {
          setTimeout(() => {
            newPanel.style.transform = 'translateX(0)';
            newOverlay.style.display = 'block';
          }, 10);
          progressDashboardOpen = true;
        }
      } else {
        if (progressDashboardOpen) {
          panel.style.transform = 'translateX(100%)';
          if (overlay) setTimeout(() => { overlay.style.display = 'none'; }, 300);
          progressDashboardOpen = false;
        } else {
          panel.style.transform = 'translateX(0)';
          if (overlay) overlay.style.display = 'block';
          progressDashboardOpen = true;
        }
      }
    }

    function finishOnboarding() {
      nextObStep(3);
      const loadingTexts = ['分析兴趣标签中...', '匹配岗位方向...', '生成学习路径...', '构建用户画像...', '准备完成！'];
      let idx = 0;
      const txtEl = document.getElementById('ob-loading-text');
      const timer = setInterval(() => {
        idx++;
        if (idx < loadingTexts.length) {
          txtEl.textContent = loadingTexts[idx];
        } else {
          clearInterval(timer);
          setTimeout(() => {
            const newAccount = generatePersonalizedAccount();
            ACCOUNTS.push(newAccount);
            renderAccountList();
            saveState();  // 保存状态（包括头像）
            document.getElementById('onboarding-page').classList.add('hidden');
            showToast('欢迎 ' + currentAccount.name + '！为你定制的工作台已就绪 🎉','check');
            setTimeout(() => {
              applyAccountToUI();  // 更新所有 UI 元素显示头像
              initDashboardCharts();
              chartsInit.dashboard = true;
            }, 100);
          }, 500);
        }
      }, 500);
    }

    // ============ SEARCH ============
    const SEARCH_DATA = [
      { type: 'page', title: '工作台', desc: '查看每日概览和数据', icon: 'fa-gauge-high', color: '#6d5ef6', action: () => switchPage('dashboard') },
      { type: 'page', title: '职业规划', desc: 'AI 引导职业方向选择', icon: 'fa-compass', color: '#0ea5b7', action: () => switchPage('planning') },
      { type: 'page', title: '理想简历', desc: '对标目标岗位生成样板简历', icon: 'fa-file-lines', color: '#10B981', action: () => switchPage('resume') },
      { type: 'page', title: '实战任务', desc: '闯关式技能训练任务', icon: 'fa-list-check', color: '#F59E0B', action: () => switchPage('tasks') },
      { type: 'page', title: '技能诊断', desc: '五维能力雷达分析', icon: 'fa-chart-pie', color: '#06b6d4', action: () => switchPage('diagnosis') },
      { type: 'page', title: '个人中心', desc: '查看和编辑个人信息', icon: 'fa-user', color: '#ec4899', action: () => switchPage('profile') },
      { type: 'job', title: '前端开发工程师', desc: '岗位推荐 · 匹配度 92%', icon: 'fa-code', color: '#6d5ef6', badge: '高度匹配', action: () => { switchPage('planning'); showToast('已跳转到职业规划页面，可查看推荐岗位','info'); } },
      { type: 'job', title: 'React Hooks 实战', desc: '学习任务 · 预计 4h', icon: 'fa-book', color: '#0ea5b7', badge: '进行中', action: () => { switchPage('tasks'); showToast('已跳转到任务列表','info'); } },
      { type: 'skill', title: 'TypeScript', desc: '技能点 · 待提升', icon: 'fa-bolt', color: '#3178c6', action: () => { switchPage('diagnosis'); showToast('已跳转到能力诊断','info'); } },
      { type: 'skill', title: 'Vue.js', desc: '技能点 · 已掌握', icon: 'fa-bolt', color: '#42b883', action: () => { switchPage('diagnosis'); } },
      { type: 'skill', title: 'Node.js', desc: '技能点 · 待学习', icon: 'fa-bolt', color: '#68a063', action: () => { switchPage('diagnosis'); } },
      { type: 'skill', title: '简历优化', desc: 'AI 简历优化建议', icon: 'fa-wand-magic-sparkles', color: '#ef4444', action: () => { switchPage('resume'); showToast('在理想简历页面可查看差距分析','info'); } },
    ];

    function highlightText(text, keyword) {
      if (!keyword) return text;
      const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
      if (idx < 0) return text;
      return text.substring(0, idx) + '<span class="search-highlight">' + text.substring(idx, idx + keyword.length) + '</span>' + text.substring(idx + keyword.length);
    }

    function renderSearchResults(keyword) {
      const dd = document.getElementById('search-dropdown');
      if (!keyword || keyword.trim().length === 0) {
        dd.innerHTML = '<div class="search-section-title">快捷导航</div>' +
          SEARCH_DATA.filter(i => i.type === 'page').slice(0, 6).map(item => renderSearchItem(item, '')).join('');
        dd.classList.add('show');
        return;
      }
      const kw = keyword.trim().toLowerCase();
      const matched = SEARCH_DATA.filter(item =>
        item.title.toLowerCase().includes(kw) || item.desc.toLowerCase().includes(kw)
      );
      if (matched.length === 0) {
        dd.innerHTML = '<div class="search-empty"><i class="fa-regular fa-face-frown mr-1"></i>没有找到 "' + keyword + '" 相关结果<br><span class="text-[11px] mt-1 inline-block">试试搜索 岗位、技能、页面名称</span></div>';
      } else {
        const jobs = matched.filter(i => i.type === 'job');
        const skills = matched.filter(i => i.type === 'skill');
        const tasks = matched.filter(i => i.type === 'page');
        const maxCol = Math.max(jobs.length, skills.length, tasks.length, 1);
        let html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">';
        html += '<div class="search-col"><div class="search-section-title">岗位</div>' +
          (jobs.length ? jobs.slice(0, 5).map(p => renderSearchItem(p, keyword)).join('') : '<div class="search-empty-col">暂无匹配</div>') +
          '</div>';
        html += '<div class="search-col"><div class="search-section-title">技能</div>' +
          (skills.length ? skills.slice(0, 5).map(p => renderSearchItem(p, keyword)).join('') : '<div class="search-empty-col">暂无匹配</div>') +
          '</div>';
        html += '<div class="search-col"><div class="search-section-title">任务/页面</div>' +
          (tasks.length ? tasks.slice(0, 5).map(p => renderSearchItem(p, keyword)).join('') : '<div class="search-empty-col">暂无匹配</div>') +
          '</div>';
        html += '</div>';
        dd.innerHTML = html;
      }
      dd.classList.add('show');
    }

    function renderSearchItem(item, keyword) {
      const badgeHtml = item.badge ? '<span class="search-item-badge" style="background:' + item.color + '15;color:' + item.color + '">' + item.badge + '</span>' : '';
      return '<div class="search-item" onclick="searchItemClick(' + SEARCH_DATA.indexOf(item) + ')">' +
        '<div class="search-item-icon" style="background:' + item.color + '15;color:' + item.color + '"><i class="fa-solid ' + item.icon + '"></i></div>' +
        '<div class="search-item-text"><div class="search-item-title">' + highlightText(item.title, keyword) + '</div><div class="search-item-desc">' + highlightText(item.desc, keyword) + '</div></div>' +
        badgeHtml +
      '</div>';
    }

    function searchItemClick(index) {
      const item = SEARCH_DATA[index];
      if (item && item.action) item.action();
      document.getElementById('search-dropdown').classList.remove('show');
      document.getElementById('global-search').value = '';
    }

    function handleSearchInput() {
      const kw = document.getElementById('global-search').value;
      renderSearchResults(kw);
    }

    function handleSearchKey(e) {
      if (e.key === 'Enter') {
        handleSearch();
      } else if (e.key === 'Escape') {
        document.getElementById('search-dropdown').classList.remove('show');
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
      }
    }

    function handleSearch() {
      const kw = document.getElementById('global-search').value.trim();
      if (!kw) {
        renderSearchResults('');
        return;
      }
      const matched = SEARCH_DATA.find(item =>
        item.title.toLowerCase().includes(kw.toLowerCase()) || item.desc.toLowerCase().includes(kw.toLowerCase())
      );
      if (matched) {
        matched.action();
        document.getElementById('search-dropdown').classList.remove('show');
        document.getElementById('global-search').value = '';
        showToast('已跳转到：' + matched.title,'check');
      } else {
        showToast('未找到相关结果，试试其他关键词','info');
      }
    }

    // Click outside to close search dropdown
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('search-wrap');
      if (wrap && !wrap.contains(e.target)) {
        document.getElementById('search-dropdown').classList.remove('show');
      }
    });

    // ============ KEYBOARD SHORTCUT ⌘K / Ctrl+K ============
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search').focus();
        handleSearchInput();
      }
    });

    // ============ AI SKELETON LOADING ============
    function showAISkeleton(containerId, steps) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const stepsList = steps || [
        { text: '正在分析简历...', done: false },
        { text: '已解析教育背景 ✓', done: true },
        { text: '正在提取项目经历...', done: false },
        { text: '正在匹配岗位要求...', done: false },
        { text: '生成诊断报告...', done: false }
      ];
      let html = '<div class="ai-skeleton-overlay" style="position:absolute;inset:0;background:rgba(255,255,255,0.92);z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;border-radius:inherit;">';
      html += '<div class="ai-skeleton-spinner" style="width:40px;height:40px;border:3px solid #e8e8ec;border-top-color:#6d5ef6;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:16px;"></div>';
      html += '<div class="ai-skeleton-title" style="font-weight:600;color:#1a1a2e;margin-bottom:12px;font-size:14px;">AI 智能分析中</div>';
      html += '<div class="ai-skeleton-steps" style="width:100%;max-width:320px;">';
      stepsList.forEach((step, i) => {
        const icon = step.done
          ? '<i class="fa-solid fa-check" style="color:#10b981;font-size:10px;"></i>'
          : '<i class="fa-solid fa-circle-notch fa-spin" style="color:#6d5ef6;font-size:10px;"></i>';
        const color = step.done ? '#10b981' : '#6d5ef6';
        html += '<div class="ai-skeleton-step" style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;' + (step.done ? 'color:' + color : 'color:#6b7280;') + '">' +
          '<span style="width:16px;height:16px;border-radius:50%;background:' + (step.done ? 'rgba(16,185,129,0.1)' : 'rgba(109,94,246,0.1)') + ';display:flex;align-items:center;justify-content:center;">' + icon + '</span>' +
          '<span>' + step.text + '</span>' +
          '</div>';
      });
      html += '</div>';
      html += '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
      html += '</div>';
      container.style.position = 'relative';
      container.insertAdjacentHTML('beforeend', html);
    }

    function hideAISkeleton(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const overlay = container.querySelector('.ai-skeleton-overlay');
      if (overlay) overlay.remove();
    }

    // ============ RESUME DIAGNOSIS (AI 简历诊断工坊) ============
    // 真实评分：基于 ATS 解析规则 + 目标岗位 JD 关键词库 + 内容启发式
    const resumeData = {
      step: 1,
      experiences: [],
      skills: []
    };

    // 目标岗位 JD 关键词库（基于主流招聘平台真实 JD 高频词提炼）
    const JD_KEYWORDS = {
      '前端开发工程师': ['JavaScript','TypeScript','React','Vue','HTML','CSS','Webpack','Vite','Node.js','性能优化','组件化','响应式','Git','HTTP','前端工程化','Hooks','Redux','状态管理','跨端','小程序'],
      '后端开发工程师': ['Java','Spring','MySQL','Redis','Linux','分布式','微服务','高并发','API','Go','Python','消息队列','Kafka','Docker','Kubernetes','SQL','缓存','并发','RPC','设计模式'],
      '数据分析师': ['SQL','Python','Excel','Tableau','Power BI','数据可视化','统计分析','A/B测试','用户画像','漏斗分析','指标体系','Pandas','NumPy','业务理解','数据建模','ETL','R语言','回归分析','BI','数据治理'],
      '产品经理': ['需求分析','用户研究','原型设计','Axure','产品规划','数据分析','项目管理','竞品分析','PRD','用户画像','Roadmap','敏捷','Scrum','A/B测试','商业化','B端','C端','MVP','功能设计','跨部门协作'],
      'UI设计师': ['Figma','Sketch','Photoshop','Illustrator','交互设计','视觉设计','设计规范','原型','组件库','动效','用户体验','Design System','C4D','After Effects','品牌设计','Web设计','App设计','色彩','排版','设计走查'],
      '运营专员': ['内容运营','用户运营','活动运营','数据分析','新媒体','公众号','小红书','抖音','社群运营','转化率','裂变','KOL','SEO','SEM','用户增长','文案','私域','GMV','ROI','复盘']
    };

    // ============ 多岗位理想样板（简历左栏对标基准） ============
    // 根据 currentAccount.target 动态切换左栏"理想候选人样板"的文本内容
    const JOB_TEMPLATES = {
      '前端开发工程师': {
        edu: '计算机科学与技术 · 本科',
        courses: ['数据结构', '计算机网络', '操作系统'],
        skills: [
          { name: 'JavaScript/ES6+', level: 'passed', label: '已掌握' },
          { name: 'React 18 + Hooks', level: 'verifying', label: '待提升' },
          { name: 'TypeScript', level: 'rejected', label: '未掌握' },
          { name: 'Webpack/Vite', level: 'rejected', label: '未掌握' }
        ],
        exp1: { title: '电商平台前端架构', desc: '主导首页与购物车，LCP 提升 40%，用微前端架构拆分业务。' },
        exp2: { title: '企业级后台管理系统', desc: '封装高级表单组件，复用率 80%。' }
      },
      '后端开发工程师': {
        edu: '软件工程 · 本科',
        courses: ['数据结构', '数据库原理', '操作系统'],
        skills: [
          { name: 'Java/Spring Boot', level: 'passed', label: '已掌握' },
          { name: 'MySQL/Redis', level: 'verifying', label: '待提升' },
          { name: '微服务架构', level: 'rejected', label: '未掌握' },
          { name: 'Docker/K8s', level: 'rejected', label: '未掌握' }
        ],
        exp1: { title: '高并发订单系统', desc: '主导核心交易链路，QPS 提升 3 倍，用分库分表支撑百万级日订单。' },
        exp2: { title: '微服务网关平台', desc: '搭建统一网关，限流熔断覆盖率 95%。' }
      },
      '产品经理': {
        edu: '信息管理 · 本科',
        courses: ['用户研究', '统计学', '市场营销'],
        skills: [
          { name: '需求分析/PRD', level: 'passed', label: '已掌握' },
          { name: 'Axure/原型', level: 'verifying', label: '待提升' },
          { name: '数据驱动决策', level: 'rejected', label: '未掌握' },
          { name: 'A/B测试', level: 'rejected', label: '未掌握' }
        ],
        exp1: { title: '社区内容产品从 0 到 1', desc: '主导 MVP 上线，DAU 3 个月破 10 万，用漏斗分析提升留存 25%。' },
        exp2: { title: 'B 端 SaaS 工作台重构', desc: '抽象 5 类角色权限模型，NPS 提升 18 分。' }
      }
    };
    // 默认 fallback（未命中具体岗位时使用前端样板）
    const DEFAULT_JOB_TEMPLATE = JOB_TEMPLATES['前端开发工程师'];

    function applyJobTemplate(target) {
      const tpl = JOB_TEMPLATES[target] || DEFAULT_JOB_TEMPLATE;
      // 教育背景
      const eduEl = document.getElementById('resume-tpl-edu');
      if (eduEl) eduEl.innerText = tpl.edu;
      // 教育课程标签
      const coursesEl = document.getElementById('resume-tpl-edu-courses');
      if (coursesEl) {
        coursesEl.innerHTML = tpl.courses.map(c =>
          '<span class="chip" style="font-size:10px;padding:2px 7px">' + c + '</span>'
        ).join('');
      }
      // 核心技能（含 badge，需用 innerHTML）
      const skillsEl = document.getElementById('resume-tpl-skills');
      if (skillsEl) {
        skillsEl.innerHTML = tpl.skills.map(s => {
          const gapCls = s.level === 'passed' ? '' : ' class="gap-item" onclick="switchPage(\'tasks\')"';
          const nameHtml = s.level === 'passed'
            ? '<span class="text-content-text">' + s.name + '</span>'
            : '<span><span' + gapCls + '>' + s.name + '</span></span>';
          return '<div class="flex items-center justify-between">' + nameHtml +
                 '<span class="badge badge-' + s.level + '">' + s.label + '</span></div>';
        }).join('');
      }
      // 项目经历
      const exp1Title = document.getElementById('resume-tpl-exp1-title');
      if (exp1Title) exp1Title.innerText = tpl.exp1.title;
      const exp1Desc = document.getElementById('resume-tpl-exp1-desc');
      if (exp1Desc) exp1Desc.innerText = tpl.exp1.desc;
      const exp2Title = document.getElementById('resume-tpl-exp2-title');
      if (exp2Title) exp2Title.innerText = tpl.exp2.title;
      const exp2Desc = document.getElementById('resume-tpl-exp2-desc');
      if (exp2Desc) exp2Desc.innerText = tpl.exp2.desc;
    }

    // 五维 ATS 评分（权重参考主流 ATS 厂商如 Moka/北森解析维度）
    const ATS_DIMS = [
      { key: 'structure', name: '结构完整度', weight: 0.20, desc: '必填字段、模块齐全度' },
      { key: 'keyword',   name: '关键词匹配', weight: 0.30, desc: '与目标岗位 JD 关键词重合度' },
      { key: 'quantify',  name: '量化成果',   weight: 0.20, desc: '经历中数字、百分比、量级描述' },
      { key: 'richness',  name: '内容充实度', weight: 0.15, desc: '经历描述长度与细节' },
      { key: 'format',    name: '格式规范',   weight: 0.15, desc: '联系方式规范、主页与可解析格式' }
    ];

    function goResumeStep(n) {
      // 简单校验：从当前步前进时校验必填
      if (n > resumeData.step) {
        if (resumeData.step === 1) {
          const req = ['r-name','r-intention','r-email','r-phone','r-province','r-city'];
          for (const id of req) {
            const v = document.getElementById(id).value.trim();
            if (!v) { showToast('请填写带 * 的必填项', 'warn'); return; }
          }
          const email = document.getElementById('r-email').value.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('邮箱格式不规范', 'warn'); return; }
        }
        if (resumeData.step === 2) {
          const sch = document.getElementById('r-school').value.trim();
          const maj = document.getElementById('r-major').value.trim();
          if (!sch || !maj) { showToast('请填写学校与专业', 'warn'); return; }
        }
        if (resumeData.step === 3 && resumeData.experiences.length === 0) {
          showToast('请至少添加一段经历', 'warn'); return;
        }
        if (resumeData.step === 4 && resumeData.skills.length < 3) {
          showToast('请至少添加 3 项技能', 'warn'); return;
        }
      }
      resumeData.step = n;
      for (let i = 1; i <= 4; i++) {
        document.getElementById('rstep-' + i).classList.toggle('hidden', i !== n);
      }
      // 步骤指示器
      for (let i = 1; i <= 4; i++) {
        const c = document.getElementById('rs-circle-' + i);
        const l = document.getElementById('rs-label-' + i);
        c.className = 'step-circle';
        l.classList.add('text-content-sub');
        if (i < n) { c.classList.add('done'); c.innerHTML = '<i class="fa-solid fa-check text-xs"></i>'; l.classList.remove('text-content-sub'); }
        else if (i === n) { c.classList.add('current'); c.textContent = i; l.classList.remove('text-content-sub'); }
        else { c.textContent = i; }
      }
      for (let i = 1; i <= 3; i++) {
        document.getElementById('rs-line-' + i).classList.toggle('done', i < n);
      }
    }

    function addResumeExp() {
      if (resumeData.experiences.length >= 3) { showToast('最多添加 3 段经历', 'warn'); return; }
      const idx = resumeData.experiences.length;
      resumeData.experiences.push({ title: '', role: '', time: '', desc: '' });
      renderResumeExps();
    }
    function removeResumeExp(idx) {
      resumeData.experiences.splice(idx, 1);
      renderResumeExps();
    }
    function renderResumeExps() {
      const list = document.getElementById('r-exp-list');
      list.innerHTML = resumeData.experiences.map((e, i) => `
        <div class="rounded-xl border border-content-divider p-4 bg-content-bg/30">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[12px] font-semibold text-content-text">经历 ${i + 1}</span>
            <button class="text-[11px] text-state-danger/70 hover:text-state-danger" onclick="removeResumeExp(${i})"><i class="fa-solid fa-trash-can mr-1"></i>删除</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <input class="input" placeholder="项目/公司名称 *" value="${e.title}" oninput="resumeData.experiences[${i}].title=this.value" />
            <input class="input" placeholder="担任角色 *" value="${e.role}" oninput="resumeData.experiences[${i}].role=this.value" />
            <input class="input col-span-2" placeholder="时间 如：2024.06-2024.09" value="${e.time}" oninput="resumeData.experiences[${i}].time=this.value" />
            <div class="col-span-2">
              <textarea class="input" rows="3" placeholder="经历描述（建议 80-150 字，含量化成果，如：优化首屏加载，LCP 降低 40%）" oninput="resumeData.experiences[${i}].desc=this.value">${e.desc}</textarea>
              <button onclick="alert('AI 准备追问：你在这个项目中遇到最大的技术难点是什么？你是如何解决的？')" style="margin-top: 8px; font-size: 12px; color: #d97706; background: #fffbeb; padding: 6px 12px; border-radius: 9999px; border: 1px solid #fde68a; cursor: pointer;">✨ AI 追问挖掘亮点</button>
            </div>
          </div>
        </div>
      `).join('');
    }
    function addResumeSkill() {
      const inp = document.getElementById('r-skill-input');
      const v = inp.value.trim();
      if (!v) return;
      if (resumeData.skills.includes(v)) { showToast('该技能已添加', 'warn'); return; }
      resumeData.skills.push(v);
      inp.value = '';
      renderResumeSkills();
    }
    function removeResumeSkill(idx) {
      resumeData.skills.splice(idx, 1);
      renderResumeSkills();
    }
    function renderResumeSkills() {
      const box = document.getElementById('r-skill-tags');
      if (resumeData.skills.length === 0) { box.innerHTML = '<span class="text-[12px] text-content-sub">尚未添加技能</span>'; return; }
      box.innerHTML = resumeData.skills.map((s, i) => `
        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium" style="background:rgba(109,94,246,0.1);color:#6d5ef6">
          ${s}<i class="fa-solid fa-xmark text-[10px] cursor-pointer hover:text-state-danger" onclick="removeResumeSkill(${i})"></i>
        </span>
      `).join('');
    }

    function autoFillResumeDemo() {
      document.getElementById('r-name').value = '林晓';
      document.getElementById('r-intention').value = '前端开发工程师';
      document.getElementById('r-email').value = 'linxiao@email.com';
      document.getElementById('r-phone').value = '138-0000-1234';
      document.getElementById('r-province').value = '浙江';
      document.getElementById('r-city').value = '杭州';
      const pSelector = document.getElementById('r-province-selector');
      if (pSelector && pSelector._select) {
        pSelector._select.setValue('浙江');
      }
      // 等省份联动填充城市选项后，再选中杭州
      setTimeout(() => {
        const cSelector = document.getElementById('r-city-selector');
        if (cSelector && cSelector._select) {
          cSelector._select.setValue('杭州');
        }
      }, 50);
      document.getElementById('r-homepage').value = 'github.com/linxiao';
      document.getElementById('r-school').value = '杭州电子科技大学';
      document.getElementById('r-major').value = '软件工程';
      document.getElementById('r-degree').value = '本科';
      document.getElementById('r-edu-time').value = '2022.09-2026.06';
      document.getElementById('r-courses').value = '数据结构, 计算机网络, 操作系统, Web 前端开发';
      resumeData.experiences = [
        { title: '校园二手交易平台', role: '前端负责人', time: '2024.03-2024.07', desc: '主导前端架构与开发，使用 React + TypeScript，封装 12 个通用组件，页面复用率达 80%，首屏 LCP 优化至 1.8s，降低 40%。' },
        { title: '字节跳动 - 抖音电商', role: '前端实习生', time: '2024.07-2024.10', desc: '参与购物车与结算页迭代，通过懒加载与虚拟列表优化长列表性能，渲染耗时降低 35%；接入埋点监控 5 个核心指标。' }
      ];
      resumeData.skills = ['JavaScript','React','TypeScript','HTML','CSS','Git','Webpack','性能优化','组件化','HTTP'];
      renderResumeExps();
      renderResumeSkills();
      showToast('示例数据已填充，可直接开始诊断', 'check');
    }

    function collectResume() {
      const p = document.getElementById('r-province')?.value.trim() || '';
      const c = document.getElementById('r-city')?.value.trim() || '';
      // 直辖市/特殊省份时只显示城市，否则拼接为"浙江·杭州"
      let city = c;
      if (p && c && !['北京','上海','天津','重庆','香港','澳门','海外'].includes(p)) {
        city = `${p}·${c}`;
      } else if (!c && p) {
        city = p;
      }
      return {
        name: document.getElementById('r-name').value.trim(),
        intention: document.getElementById('r-intention').value,
        email: document.getElementById('r-email').value.trim(),
        phone: document.getElementById('r-phone').value.trim(),
        province: p,
        city: city,
        homepage: document.getElementById('r-homepage').value.trim(),
        school: document.getElementById('r-school').value.trim(),
        major: document.getElementById('r-major').value.trim(),
        degree: document.getElementById('r-degree').value,
        eduTime: document.getElementById('r-edu-time').value.trim(),
        courses: document.getElementById('r-courses').value.trim(),
        experiences: resumeData.experiences.filter(e => e.title || e.desc),
        skills: resumeData.skills.slice()
      };
    }

    // 真实评分计算（启发式，非随机）
    function scoreResume(r) {
      const kw = JD_KEYWORDS[r.intention] || [];
      const lowerSkills = r.skills.map(s => s.toLowerCase());

      // 1. 结构完整度：必填模块齐全度
      const reqFields = [r.name, r.intention, r.email, r.phone, r.city, r.school, r.major];
      const filledReq = reqFields.filter(Boolean).length;
      let structure = (filledReq / reqFields.length) * 60;
      if (r.eduTime) structure += 10;
      if (r.courses) structure += 10;
      if (r.experiences.length >= 1) structure += 10;
      if (r.skills.length >= 5) structure += 10;
      structure = Math.min(100, structure);

      // 2. 关键词匹配：技能与 JD 关键词重合度
      const matched = kw.filter(k => lowerSkills.some(s => s.toLowerCase() === k.toLowerCase() || s.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(s.toLowerCase())));
      const missing = kw.filter(k => !matched.includes(k));
      const keyword = kw.length ? Math.round((matched.length / kw.length) * 100) : 50;

      // 3. 量化成果：经历中数字/百分比/量级出现密度
      const expText = r.experiences.map(e => e.desc).join(' ');
      const numMatches = expText.match(/(\d+%|\d+次|\d+个|\d+\.?\d*s|\d+\.?\d*ms|\d+万|\d+倍|\d+人|\d+小时|\d+h)/g) || [];
      const expCount = Math.max(1, r.experiences.length);
      const quantify = Math.min(100, Math.round((numMatches.length / expCount) * 35) + (numMatches.length > 0 ? 30 : 0));

      // 4. 内容充实度：平均经历字数
      const avgLen = r.experiences.length ? expText.replace(/\s/g, '').length / r.experiences.length : 0;
      let richness = 0;
      if (avgLen >= 80) richness += 40;
      if (avgLen >= 120) richness += 30;
      if (avgLen >= 150) richness += 20;
      richness += Math.min(10, Math.round(avgLen / 20));
      richness = Math.min(100, richness);

      // 5. 格式规范：邮箱、电话规范、主页、技能大小写
      let format = 0;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) format += 30;
      if (/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/.test(r.phone)) format += 25;
      if (r.homepage) format += 20;
      if (r.skills.length >= 8) format += 15;
      if (r.degree) format += 10;
      format = Math.min(100, format);

      const dims = { structure, keyword, quantify, richness, format };
      let total = 0;
      ATS_DIMS.forEach(d => total += dims[d.key] * d.weight);
      total = Math.round(total);
      return { dims, total, matched, missing, expText, numMatches, avgLen: Math.round(avgLen) };
    }

    function gradeOf(total) {
      if (total >= 85) return { grade: 'A', text: '优秀', desc: 'ATS 通过率高，建议小幅优化', color: 'state-success' };
      if (total >= 70) return { grade: 'B', text: '良好', desc: '基本可通过 ATS，部分维度待加强', color: 'brand-cyan' };
      if (total >= 55) return { grade: 'C', text: '一般', desc: '存在被 ATS 过滤风险，需重点优化', color: 'state-warning' };
      return { grade: 'D', text: '较弱', desc: '大概率被 ATS 过滤，建议全面重写', color: 'state-danger' };
    }

    function startResumeDiagnosis() {
      if (resumeData.skills.length < 3) { showToast('请至少添加 3 项技能再诊断', 'warn'); return Promise.resolve(); }
      document.getElementById('resume-form-view').classList.add('hidden');
      document.getElementById('resume-analyzing-view').classList.remove('hidden');
      document.getElementById('resume-report-view').classList.add('hidden');
      setResumeFlowStep(2);
      const stages = ['正在解析简历结构…', '正在提取关键词…', '正在比对目标岗位 JD…', '正在评估量化成果…', '正在生成优化建议…'];
      let p = 0, s = 0;
      const pctEl = document.getElementById('analyze-pct');
      const barEl = document.getElementById('analyze-progress');
      const stageEl = document.getElementById('analyze-stage');
      // 返回 Promise，让 withLoading 能在分析完成后恢复按钮
      return new Promise(resolve => {
        const timer = setInterval(() => {
          p += Math.random() * 12 + 4;
          if (p >= 100) p = 100;
          barEl.style.width = p + '%';
          pctEl.textContent = Math.round(p) + '%';
          const ns = Math.min(stages.length - 1, Math.floor(p / 22));
          if (ns !== s) { s = ns; stageEl.textContent = stages[s]; }
          if (p >= 100) {
            clearInterval(timer);
            setTimeout(() => {
              renderResumeReport();
              resolve();
            }, 350);
          }
        }, 220);
      });
    }

    function renderResumeReport() {
      const r = collectResume();
      const s = scoreResume(r);
      const g = gradeOf(s.total);

      document.getElementById('resume-analyzing-view').classList.add('hidden');
      document.getElementById('resume-report-view').classList.remove('hidden');
      setResumeFlowStep(3);

      // ATS 评分透明度卡片
      const parseEl = document.getElementById('ats-parse-label');
      if (parseEl) {
        const parseOk = s.dims.format >= 60 && s.dims.structure >= 50;
        parseEl.textContent = parseOk ? '✓ 通过' : '⚠ 待优化';
        parseEl.style.color = parseOk ? '#059669' : '#d97706';
      }
      const kwPctEl = document.getElementById('ats-keyword-pct');
      const kwBarEl = document.getElementById('ats-keyword-bar');
      if (kwPctEl && kwBarEl) {
        kwPctEl.textContent = s.dims.keyword + '%';
        kwBarEl.style.width = s.dims.keyword + '%';
      }
      const structBadge = document.getElementById('ats-structure-badge');
      if (structBadge) {
        let st = '良好', cls = 'badge-cyan';
        if (s.dims.structure >= 80) { st = '优秀'; cls = 'badge-passed'; }
        else if (s.dims.structure >= 60) { st = '良好'; cls = 'badge-cyan'; }
        else if (s.dims.structure >= 40) { st = '一般'; cls = 'badge badge-verifying'; }
        else { st = '待完善'; cls = 'badge badge-rejected'; }
        structBadge.textContent = st;
        structBadge.className = cls;
      }

      // 数字滚动
      const totalEl = document.getElementById('report-total');
      let cur = 0;
      const anim = setInterval(() => { cur += Math.max(1, Math.round((s.total - cur) / 4)); if (cur >= s.total) { cur = s.total; clearInterval(anim); } totalEl.textContent = cur; }, 30);
      const gEl = document.getElementById('report-grade');
      gEl.textContent = g.grade + ' · ' + g.text;
      gEl.style.background = 'rgba(109,94,246,0.1)'; gEl.style.color = '#6d5ef6';
      document.getElementById('report-grade-desc').textContent = g.desc;

      // 雷达图
      const radar = echarts.init(document.getElementById('ats-radar'));
      radar.setOption({
        radar: {
          indicator: ATS_DIMS.map(d => ({ name: d.name, max: 100 })),
          radius: '62%', center: ['50%', '52%'],
          axisName: { color: '#6b7280', fontSize: 10 },
          splitArea: { areaStyle: { color: ['rgba(109,94,246,0.03)', 'rgba(109,94,246,0.06)'] } },
          splitLine: { lineStyle: { color: '#e8e8ec' } },
          axisLine: { lineStyle: { color: '#e8e8ec' } }
        },
        series: [{
          type: 'radar', data: [{
            value: [s.dims.structure, s.dims.keyword, s.dims.quantify, s.dims.richness, s.dims.format],
            name: '我的简历',
            areaStyle: { color: 'rgba(109,94,246,0.25)' },
            lineStyle: { color: '#6d5ef6', width: 2 },
            itemStyle: { color: '#6d5ef6' }
          }]
        }]
      });

      // 维度明细
      const dimsBox = document.getElementById('report-dims');
      dimsBox.innerHTML = ATS_DIMS.map(d => {
        const v = s.dims[d.key];
        const color = v >= 80 ? '#10b981' : v >= 60 ? '#0ea5b7' : v >= 40 ? '#f59e0b' : '#ef4444';
        return `<div>
          <div class="flex items-center justify-between mb-1">
            <div><span class="font-semibold text-[13px] text-content-text">${d.name}</span><span class="text-[11px] text-content-sub ml-2">${d.desc}</span></div>
            <span class="font-display font-bold text-[14px]" style="color:${color}">${v}</span>
          </div>
          <div class="h-1.5 bg-content-bg rounded-full overflow-hidden"><div class="h-full rounded-full transition-all duration-700" style="width:${v}%;background:${color}"></div></div>
        </div>`;
      }).join('');

      // 关键词
      document.getElementById('kw-summary').textContent = `命中 ${s.matched.length}/${(JD_KEYWORDS[r.intention] || []).length}`;
      document.getElementById('kw-matched').innerHTML = s.matched.length ? s.matched.map(k => `<span class="px-2.5 py-1 rounded-md text-[11px] font-medium" style="background:rgba(16,185,129,0.12);color:#059669">${k}</span>`).join('') : '<span class="text-[11px] text-content-sub">无</span>';
      document.getElementById('kw-missing').innerHTML = s.missing.length ? s.missing.map(k => `<span class="px-2.5 py-1 rounded-md text-[11px] font-medium" style="background:rgba(239,68,68,0.1);color:#dc2626">${k}</span>`).join('') : '<span class="text-[11px] text-content-sub">无缺失</span>';

      // 优化建议（含优先级标签 + 今天可做的一件事）
      const issues = [];
      if (s.dims.keyword < 70) issues.push({ sev: 'high', t: '关键词覆盖不足', d: `目标岗位 ${r.intention} 的 JD 中你还缺少 ${s.missing.slice(0, 5).join('、')} 等关键词，建议在技能区或经历描述中补充。`, action: '在技能清单中补充缺失关键词，重写首段经历' });
      if (s.dims.quantify < 70) issues.push({ sev: 'high', t: '量化成果偏少', d: '经历中缺少数字化的成果描述。建议用「动作 + 对象 + 数字 + 结果」句式，如「优化首屏加载，LCP 降低 40%」。', action: '挑选 1 段经历，添加 2-3 个量化数字' });
      if (s.dims.richness < 70) issues.push({ sev: 'mid', t: '经历描述偏单薄', d: `平均每段经历 ${s.avgLen} 字，建议扩充至 120-150 字，补充技术栈、职责与产出。`, action: '将每段经历扩充 50 字，补充技术栈和决策过程' });
      if (s.dims.structure < 80) issues.push({ sev: 'mid', t: '结构模块待完善', d: '建议补全教育时间、相关课程等模块，ATS 解析依赖结构化字段完整性。', action: '补全教育背景时间和相关课程信息' });
      if (s.dims.format < 80) issues.push({ sev: 'low', t: '格式可进一步规范', d: '确保邮箱、电话格式标准，补充个人主页（GitHub/作品集）可提升可解析性与可信度。', action: '检查邮箱电话格式，补充 GitHub 或作品集链接' });
      if (r.experiences.length < 2) issues.push({ sev: 'mid', t: '经历数量偏少', d: '建议补充 2-3 段项目或实习经历，体现能力广度与成长轨迹。', action: '补充 1 段课程项目或编程竞赛经历' });
      if (issues.length === 0) issues.push({ sev: 'low', t: '简历整体良好', d: '各维度均达标，建议持续维护并针对具体岗位微调关键词。', action: '针对目标岗位 JD 微调关键词，保持简历更新' });
      const sevMeta = {
        high: { icon: '🔴', label: '高优先级', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', badgeBg: '#ef4444' },
        mid: { icon: '🟡', label: '中优先级', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', badgeBg: '#f59e0b' },
        low: { icon: '🟢', label: '低优先级', color: '#10b981', bg: 'rgba(16,185,129,0.1)', badgeBg: '#10b981' }
      };
      document.getElementById('issue-count').textContent = issues.length;
      document.getElementById('report-issues').innerHTML = issues.map(it => {
        const sm = sevMeta[it.sev];
        return `<div class="flex gap-3 p-3.5 rounded-xl" style="background:${sm.bg}">
          <span class="flex-shrink-0 w-16 text-center text-[10px] font-bold py-1 rounded-lg" style="background:${sm.badgeBg};color:#fff">${sm.icon} ${sm.label}</span>
          <div class="flex-1">
            <div class="text-[13px] font-semibold text-content-text">${it.t}</div>
            <div class="text-[12px] text-content-sub mt-0.5 leading-relaxed">${it.d}</div>
            <div class="mt-2 flex items-start gap-1.5 p-2 rounded-lg" style="background:rgba(255,255,255,0.6);border:1px dashed ${sm.color}40">
              <span class="text-[14px] leading-none">💡</span>
              <div class="text-[11px] text-content-text">
                <span class="font-semibold" style="color:${sm.color}">今天可做的一件事：</span>${it.action}
              </div>
            </div>
          </div>
        </div>`;
      }).join('');

      // 同步左侧目标岗位
      const tj = document.getElementById('resume-target-job');
      if (tj) tj.textContent = r.intention;

      // AI 经历改写器
      renderRewriter(r.experiences);

      // P1：打通简历 → 诊断的数据通路
      syncResumeToDiagnosis();
    }

    // ============ 简历 → 诊断 数据通路 ============
    // 读取简历填写的技能，联动诊断页的技能状态与"已掌握"计数
    function syncResumeToDiagnosis() {
      if (!resumeData || !Array.isArray(resumeData.skills)) return;
      const userSkills = resumeData.skills.map(s => (s || '').toLowerCase());
      // 诊断页技能清单容器
      const list = document.getElementById('skill-gaps-list');
      if (!list) return;
      let masteredCount = 0;
      // 遍历诊断页每个技能条目，按文本匹配判断是否在简历技能中
      const items = list.querySelectorAll(':scope > .rounded-xl, :scope > div');
      items.forEach(item => {
        const nameEl = item.querySelector('.font-semibold');
        if (!nameEl) return;
        const skillName = nameEl.textContent.trim();
        const lower = skillName.toLowerCase();
        // 简历中包含 React 或 TypeScript 等关键词时，"未掌握" → "待提升"
        const matched = userSkills.some(us =>
          lower.includes(us) || us.includes(lower) ||
          (us.includes('react') && lower.includes('react')) ||
          (us.includes('typescript') && lower.includes('typescript')) ||
          (us.includes('ts') && lower.includes('typescript')) ||
          (us.includes('js') && lower.includes('javascript'))
        );
        if (matched) {
          const badge = item.querySelector('.badge');
          if (badge && badge.textContent.trim() === '未掌握') {
            badge.className = 'badge badge-verifying';
            badge.textContent = '待提升';
            const dot = item.querySelector('.dot');
            if (dot) { dot.classList.remove('dot-missing'); dot.classList.add('dot-improve'); }
          }
        }
        // 统计已掌握数量
        const badge = item.querySelector('.badge');
        if (badge && badge.textContent.trim() === '已掌握') masteredCount++;
      });
      // 更新诊断页顶部"已掌握技能"计数
      const masteredEl = document.querySelector('#page-diagnosis .text-state-success');
      if (masteredEl) {
        const total = 14;
        masteredEl.innerHTML = masteredCount + ' <span class="text-base text-content-sub">/ ' + total + '</span>';
      }
    }

    function resetResumeDiagnosis() {
      document.getElementById('resume-report-view').classList.add('hidden');
      document.getElementById('resume-analyzing-view').classList.add('hidden');
      document.getElementById('resume-form-view').classList.remove('hidden');
      setResumeFlowStep(1);
      goResumeStep(1);
    }

    // ============ AI 经历改写器（真实启发式改写，不伪造数据） ============
    // 改写规则：强动词前置 / 量化突出 / 长句分点 / 缺数据处诚实标注
    const STRONG_VERBS = [
      [/(^|[，。；\n])\s*负责/g, '$1主导'],
      [/(^|[，。；\n])\s*参与/g, '$1协作'],
      [/(^|[，。；\n])\s*做了/g, '$1完成'],
      [/(^|[，。；\n])\s*帮忙/g, '$1协助'],
      [/(^|[，。；\n])\s*帮忙/g, '$1协助'],
      [/(^|[，。；\n])\s*用到了/g, '$1应用'],
      [/(^|[，。；\n])\s*写了一个/g, '$1开发'],
      [/(^|[，。；\n])\s*做了一个/g, '$1搭建']
    ];
    const RESULT_CUES = ['提升','降低','优化','减少','增加','达到','实现','缩短','提高','节省','下降','增长','覆盖','复用','稳定'];

    function rewriteExperience(desc) {
      if (!desc || !desc.trim()) {
        return { rewritten: '', notes: ['经历描述为空，请先填写。'], changed: false, hasNumbers: false };
      }
      let text = desc.trim();
      const notes = [];
      const original = text;

      // 1. 提取已有数字
      const numbers = text.match(/\d+(\.\d+)?%|\d+(\.\d+)?\s*s\b|\d+(\.\d+)?ms|\d+万|\d+倍|\d+个|\d+次|\d+人|\d+小时|\d+h\b|\d+%\s*/g) || [];
      const hasNumbers = numbers.length > 0;

      // 2. 弱动词 → 强动词
      STRONG_VERBS.forEach(([from, to]) => { text = text.replace(from, to); });

      // 3. 强动词前置：若开头不是强动词，补「主导/负责」
      if (!/^(主导|负责|搭建|设计|实现|提升|降低|带领|推动|重构|封装|开发|优化|完成|协作|联合|应用|协助)/.test(text)) {
        text = '主导' + text;
        notes.push('开头补强动词「主导」，让动作主体更明确');
      }

      // 4. 量化处理：有数字则保留突出；无数字则诚实标注 [待补充数据]，绝不伪造
      if (hasNumbers) {
        notes.push(`检测到 ${numbers.length} 处量化数据，已保留并强化`);
      } else {
        // 在句末补一个结果槽位
        text = text.replace(/[。]?\s*$/, '，[待补充量化数据：如效率提升 X% / 服务 X 用户]。');
        notes.push('未检测到量化数据，已标注 [待补充数据] 位置，请填写真实指标（不可编造）');
      }

      // 5. 结果导向：若无结果词，提示补充
      if (!RESULT_CUES.some(c => text.includes(c))) {
        notes.push('建议补充结果导向词（提升/降低/优化等），形成「动作+结果」闭环');
      }

      // 6. 长句结构化：>80 字且无分点 → 拆分为编号要点
      const cleanLen = text.replace(/\s/g, '').length;
      if (cleanLen > 80 && !/\n/.test(text)) {
        const parts = text.split(/[，；。]/).map(s => s.trim()).filter(s => s && s.length > 2);
        if (parts.length >= 3) {
          text = parts.map((p, i) => `${i + 1}. ${p}`).join('\n');
          notes.push('长句已拆分为分点结构，提升可读性');
        }
      }

      const changed = text !== original;
      return { rewritten: text, notes, changed, hasNumbers, numbers };
    }

    function renderRewriter(experiences) {
      const box = document.getElementById('report-rewriter');
      if (!experiences.length) {
        box.innerHTML = '<div class="text-[12px] text-content-sub text-center py-4">暂无经历，请在表单中添加</div>';
        return;
      }
      box.innerHTML = experiences.map((e, i) => {
        const weak = !e.desc || !(e.desc.match(/\d/)) || e.desc.replace(/\s/g, '').length < 60;
        const weakTag = weak ? '<span class="badge badge-verifying ml-2">待优化</span>' : '<span class="badge badge-passed ml-2">已较好</span>';
        return `<div class="rounded-xl border border-content-divider p-4" id="rw-card-${i}">
          <div class="flex items-center justify-between mb-2">
            <div class="text-[12px] font-semibold text-content-text">经历 ${i + 1}：${e.title || '未命名'} · ${e.role || ''}${weakTag}</div>
            <button class="btn-cyan px-3 py-1.5 rounded-lg text-[11px]" onclick="aiRewriteOne(${i})"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>AI 改写</button>
          </div>
          <div class="text-[11px] text-content-sub mb-1">原文</div>
          <div class="text-[12px] text-content-text bg-content-bg/50 rounded-lg p-2.5 mb-2 leading-relaxed" id="rw-orig-${i}">${(e.desc || '（空）').replace(/\n/g, '<br>')}</div>
          <div id="rw-result-${i}"></div>
        </div>`;
      }).join('');
    }

    function aiRewriteOne(i) {
      const exp = resumeData.experiences[i];
      const res = rewriteExperience(exp.desc);
      const resultBox = document.getElementById('rw-result-' + i);
      if (!res.changed && !res.rewritten) {
        resultBox.innerHTML = `<div class="text-[11px] text-state-danger">${res.notes[0]}</div>`;
        return;
      }
      const notesHtml = res.notes.map(n => `<li>${n}</li>`).join('');
      resultBox.innerHTML = `
        <div class="text-[11px] text-content-sub mb-1">AI 优化版</div>
        <div class="text-[12px] text-content-text rounded-lg p-2.5 mb-2 leading-relaxed" style="background:rgba(109,94,246,0.06);border:1px solid rgba(109,94,246,0.18)">${res.rewritten.replace(/\n/g, '<br>')}</div>
        <div class="text-[11px] text-content-sub mb-2"><i class="fa-solid fa-circle-info mr-1 text-brand-purple"></i>改写说明：<ul class="list-disc pl-4 mt-1 space-y-0.5">${notesHtml}</ul></div>
        <div class="flex gap-2">
          <button class="btn-primary px-3 py-1.5 rounded-lg text-[11px]" onclick="applyRewrite(${i})"><i class="fa-solid fa-check mr-1"></i>应用到简历</button>
          <button class="btn-ghost px-3 py-1.5 rounded-lg text-[11px]" onclick="document.getElementById('rw-result-${i}').innerHTML=''">收起</button>
        </div>
      `;
    }

    function applyRewrite(i) {
      const res = rewriteExperience(resumeData.experiences[i].desc);
      resumeData.experiences[i].desc = res.rewritten;
      // 更新原文显示
      const origEl = document.getElementById('rw-orig-' + i);
      if (origEl) origEl.innerHTML = res.rewritten.replace(/\n/g, '<br>');
      document.getElementById('rw-result-' + i).innerHTML = '<div class="text-[11px] text-state-success"><i class="fa-solid fa-circle-check mr-1"></i>已应用，可重新诊断查看分数变化</div>';
      showToast('改写已应用至简历', 'check');
    }

    // ============ AI MOCK INTERVIEW (AI 模拟面试) ============
    const mockIv = {
      type: 'technical',
      job: '前端开发工程师',
      questions: [],
      idx: 0,
      answers: [],
      results: []
    };

    // 面试题库（基于各岗位真实高频面试题整理）
    const IV_QUESTION_BANK = {
      technical: {
        '前端开发工程师': [
          { tag: 'JS 基础', hint: '考察闭包与作用域理解', text: '请解释 JavaScript 中的闭包，并举一个实际应用场景。', keys: ['闭包', '作用域', '变量', '内存', '函数', '回收', '泄漏', '私有'] },
          { tag: '框架原理', hint: '考察对 React 响应式的理解', text: 'React 的虚拟 DOM 是什么？Diff 算法如何工作？', keys: ['虚拟DOM', 'diff', '对比', 'key', '渲染', '真实DOM', '树', '性能', '批量'] },
          { tag: '性能优化', hint: '考察工程化与性能意识', text: '首屏加载慢，你会从哪些维度排查与优化？', keys: ['首屏', 'LCP', '懒加载', '代码分割', 'CDN', '缓存', '压缩', '预渲染', 'Tree Shaking', '资源'] },
          { tag: '工程化', hint: '考察构建工具理解', text: 'Webpack 与 Vite 的核心区别是什么？如何选型？', keys: ['Webpack', 'Vite', '构建', '打包', 'ESM', 'HMR', '依赖', '预构建', '开发', '生产'] },
          { tag: '网络/浏览器', hint: '考察浏览器机制', text: '从输入 URL 到页面渲染完成发生了什么？', keys: ['DNS', 'TCP', 'HTTP', '请求', '响应', '解析', 'HTML', 'CSSOM', '渲染树', '布局', '绘制'] }
        ],
        '后端开发工程师': [
          { tag: '并发', hint: '考察并发控制', text: '如何设计一个高并发的秒杀系统？', keys: ['缓存', '限流', '队列', '库存', 'Redis', '锁', '降级', '预热', '异步', '数据库'] },
          { tag: '数据库', hint: '考察 MySQL 索引', text: 'MySQL 索引底层结构是什么？什么情况下索引会失效？', keys: ['B+', '树', '索引', '失效', 'explain', '最左前缀', '聚簇', '回表', '覆盖'] },
          { tag: '分布式', hint: '考察分布式一致性', text: '分布式锁有哪些实现方式？各自优缺点？', keys: ['Redis', 'Zookeeper', '锁', '续期', 'Redlock', 'CP', 'AP', '网络分区', '互斥'] },
          { tag: '框架', hint: '考察 Spring 原理', text: 'Spring Bean 的生命周期是怎样的？', keys: ['实例化', '属性', '初始化', 'BeanPostProcessor', '循环依赖', '销毁', '容器', 'AOP'] },
          { tag: '系统设计', hint: '考察架构能力', text: '设计一个短链生成服务，如何保证高可用？', keys: ['发号器', 'Base62', '缓存', '重定向', '布隆', '分库分表', '一致性', '限流'] }
        ],
        '数据分析师': [
          { tag: 'SQL', hint: '考察 SQL 能力', text: '用 SQL 写出每个部门薪资前三的员工。', keys: ['window', 'row_number', 'partition', 'order', 'rank', 'dense_rank', 'join', '子查询'] },
          { tag: '统计', hint: '考察统计基础', text: 'A/B 测试如何设计？如何判断结果显著？', keys: ['假设检验', 'p值', '显著性', '样本量', '分流', '指标', '置信区间', '功效'] },
          { tag: '业务', hint: '考察业务理解', text: 'DAU 下降 10%，如何排查原因？', keys: ['维度拆解', '新老', '渠道', '版本', '漏斗', '同环比', '外部', '归因'] },
          { tag: '建模', hint: '考察建模能力', text: '如何预测用户流失？特征如何选择？', keys: ['特征', 'IV', 'WOE', '逻辑回归', 'XGBoost', '评估', 'AUC', '过拟合', '采样'] },
          { tag: '工具', hint: '考察 Python 数据栈', text: 'Pandas 中 merge 与 join 的区别？如何处理大数据量？', keys: ['merge', 'join', 'index', 'chunk', 'dask', '内存', '分块', 'how'] }
        ]
      },
      behavioral: {
        'default': [
          { tag: '团队协作', hint: '考察冲突处理', text: '讲一次你和同事/同学在方案上产生分歧的经历，你是怎么处理的？', keys: ['分歧', '沟通', '倾听', '目标', '数据', '妥协', '结果', '复盘', '对事不对人', '共识'] },
          { tag: '抗压能力', hint: '考察压力下的表现', text: '描述一次你在紧迫 deadline 下完成任务的经过。', keys: ['优先级', '拆解', '时间', '沟通', '风险', '聚焦', '交付', '复盘', '资源'] },
          { tag: '主动性', hint: '考察自驱力', text: '讲一个你主动发现问题并推动解决的事例。', keys: ['发现', '主动', '调研', '方案', '推动', '落地', '影响', '数据', '跨部门'] },
          { tag: '失败经历', hint: '考察反思能力', text: '说一个你失败的项目/任务，你学到了什么？', keys: ['失败', '原因', '反思', '改进', '复盘', '教训', '调整', '后续', '坦诚'] },
          { tag: '影响力', hint: '考察领导力', text: '你如何影响他人接受你的观点？举个实例。', keys: ['说服', '数据', '逻辑', '共情', '试点', '示范', '利益', '共赢', '影响力'] }
        ]
      },
      hr: {
        'default': [
          { tag: '自我介绍', hint: '考察表达能力', text: '请用 2 分钟做一个自我介绍。', keys: ['岗位', '匹配', '亮点', '经历', '技能', '成果', '动机', '简洁', '结构'] },
          { tag: '求职动机', hint: '考察意向度', text: '为什么选择我们公司/这个岗位？', keys: ['公司', '行业', '岗位', '匹配', '了解', '价值', '发展', '文化', '调研'] },
          { tag: '职业规划', hint: '考察稳定性与规划', text: '未来 3 年你的职业规划是什么？', keys: ['短期', '中期', '长期', '技能', '方向', '价值', '岗位', '学习', '现实'] },
          { tag: '薪酬期望', hint: '考察谈判意识', text: '你的期望薪资是多少？依据是什么？', keys: ['市场', '调研', '能力', '依据', '范围', '弹性', '价值', '总包', '合理'] },
          { tag: '反问环节', hint: '考察思考深度', text: '你有什么想问我的？', keys: ['团队', '业务', '成长', '考核', '挑战', '具体', '深入', '岗位', '思考'] }
        ]
      }
    };

    const IV_TYPE_DESC = {
      technical: '<b>技术面</b>：考察专业知识、项目深挖、算法与系统设计，5 题。AI 依据技术要点覆盖率与方案合理性评分。',
      behavioral: '<b>行为面</b>：考察团队协作、抗压、主动性等软素质，5 题。建议用 STAR 法则（情境-任务-行动-结果）作答。',
      hr: '<b>HR 面</b>：考察求职动机、职业规划、文化匹配，5 题。侧重表达逻辑与岗位意向度。'
    };

    // 面试五维评分量表（参考企业通用面试官评分卡）
    const IV_RUBRIC = [
      { key: 'structure', name: '结构清晰度', full: '逻辑分层、要点明确，使用总分总或 STAR 结构', desc: '0-20 分' },
      { key: 'tech',      name: '技术准确度', full: '专业要点覆盖正确，无明显知识性错误', desc: '0-20 分' },
      { key: 'logic',     name: '表达逻辑',   full: '因果连贯，论证充分，自洽无矛盾', desc: '0-20 分' },
      { key: 'quant',     name: '量化具体性', full: '有具体数据、案例、细节支撑论点', desc: '0-20 分' },
      { key: 'length',    name: '长度适宜',   full: '200-500 字，详略得当，不啰嗦不空泛', desc: '0-20 分' }
    ];

    function selectIvType(type) {
      mockIv.type = type;
      document.querySelectorAll('.iv-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
      document.getElementById('iv-type-desc').innerHTML = IV_TYPE_DESC[type];
    }

    function renderIvRubricPreview() {
      document.getElementById('iv-rubric-preview').innerHTML = IV_RUBRIC.map(r => `
        <div class="rounded-lg p-2.5 text-center" style="background:#f7f7f9;border:1px solid #e8e8ec">
          <div class="text-[11px] font-bold text-content-text mb-0.5">${r.name}</div>
          <div class="text-[10px] text-content-sub leading-snug">${r.desc}</div>
        </div>
      `).join('');
    }

    function pickIvQuestions() {
      const bank = IV_QUESTION_BANK[mockIv.type];
      const job = document.getElementById('iv-job').value;
      mockIv.job = job;
      let qs = bank[job] || bank['default'] || bank[Object.keys(bank)[0]];
      return qs.slice(0, 5);
    }

    function startInterview() {
      mockIv.questions = pickIvQuestions();
      mockIv.idx = 0;
      mockIv.answers = [];
      mockIv.results = [];
      document.getElementById('iv-setup-view').classList.add('hidden');
      document.getElementById('iv-report-view').classList.add('hidden');
      document.getElementById('iv-ask-view').classList.remove('hidden');
      document.getElementById('iv-q-count');
      renderIvQuestion();
    }

    function renderIvQuestion() {
      const q = mockIv.questions[mockIv.idx];
      if (!q) return;
      document.getElementById('iv-meta').textContent = `${mockIv.type === 'technical' ? '技术面' : mockIv.type === 'behavioral' ? '行为面' : 'HR 面'} · 第 ${mockIv.idx + 1}/${mockIv.questions.length} 题`;
      document.getElementById('iv-progress').style.width = (mockIv.idx / mockIv.questions.length * 100) + '%';
      document.getElementById('iv-q-tag').textContent = q.tag;
      document.getElementById('iv-q-hint').textContent = q.hint;
      document.getElementById('iv-q-text').textContent = q.text;
      const ans = document.getElementById('iv-answer');
      ans.value = mockIv.answers[mockIv.idx] || '';
      ans.oninput = () => { document.getElementById('iv-char-count').textContent = ans.value.length + ' 字'; updateIvTip(ans.value); };
      document.getElementById('iv-char-count').textContent = ans.value.length + ' 字';
      updateIvTip(ans.value);
      ans.focus();
    }

    function updateIvTip(text) {
      const len = text.length;
      const tipEl = document.getElementById('iv-tip');
      if (len === 0) tipEl.textContent = '';
      else if (len < 150) tipEl.innerHTML = '<span class="text-state-warning">偏短，建议扩充细节</span>';
      else if (len <= 500) tipEl.innerHTML = '<span class="text-state-success">长度适宜</span>';
      else tipEl.innerHTML = '<span class="text-state-warning">偏长，建议精简</span>';
    }

    function scoreAnswer(text, q) {
      const len = text.replace(/\s/g, '').length;
      // 1. 结构清晰度：是否使用分点/连接词/STAR
      let structure = 0;
      if (/(首先|其次|然后|最后|一方面|另一方面)/.test(text)) structure += 30;
      if (/(1[.、)]|2[.、)]|3[.、)]|第一|第二|第三)/.test(text)) structure += 30;
      if (/(情境|任务|行动|结果|背景|目标|做法|成果|S|T|A|R)/.test(text)) structure += 20;
      if (len > 50) structure += 20;
      structure = Math.min(100, structure);

      // 2. 技术/要点准确度：关键词覆盖率
      const lower = text.toLowerCase();
      const hit = q.keys.filter(k => lower.includes(k.toLowerCase()) || lower.includes(k.toLowerCase().replace(/\s/g, ''))).length;
      const tech = q.keys.length ? Math.round((hit / q.keys.length) * 100) : 50;

      // 3. 表达逻辑：因果/转折连接词密度
      const logicWords = (text.match(/(因为|所以|因此|由于|从而|导致|为了|通过|使得|进而|然而|但是|虽然|尽管)/g) || []).length;
      let logic = Math.min(100, logicWords * 20 + (len > 100 ? 30 : 0));

      // 4. 量化具体性：数字/百分比密度
      const nums = (text.match(/(\d+%|\d+次|\d+个|\d+人|\d+万|\d+倍|\d+\.?\d*|千万|百万)/g) || []).length;
      let quant = Math.min(100, nums * 20 + (nums > 0 ? 20 : 0));

      // 5. 长度适宜：甜区 200-500
      let length;
      if (len < 50) length = 20;
      else if (len < 150) length = 45;
      else if (len <= 250) length = 75;
      else if (len <= 500) length = 100;
      else if (len <= 700) length = 80;
      else length = 55;

      const dims = { structure, tech, logic, quant, length };
      const total = Math.round((structure + tech + logic + quant + length) / 5);
      return { dims, total, hit, keysLen: q.keys.length };
    }

    function submitAnswer() {
      const text = document.getElementById('iv-answer').value.trim();
      if (!text) { showToast('请先输入你的回答', 'warn'); return; }
      if (text.length < 20) { showToast('回答过短，请至少写 20 字', 'warn'); return; }
      mockIv.answers[mockIv.idx] = text;
      mockIv.results[mockIv.idx] = scoreAnswer(text, mockIv.questions[mockIv.idx]);
      advanceIv();
    }

    function skipQuestion() {
      mockIv.answers[mockIv.idx] = '';
      mockIv.results[mockIv.idx] = { dims: { structure: 0, tech: 0, logic: 0, quant: 0, length: 0 }, total: 0, hit: 0, keysLen: mockIv.questions[mockIv.idx].keys.length };
      advanceIv();
    }

    function advanceIv() {
      mockIv.idx++;
      if (mockIv.idx >= mockIv.questions.length) {
        renderIvReport();
      } else {
        renderIvQuestion();
      }
    }

    function quitInterview() {
      if (confirm('确定退出本次模拟面试？进度不会保存。')) {
        resetInterview();
      }
    }

    function resetInterview() {
      mockIv.idx = 0; mockIv.answers = []; mockIv.results = [];
      document.getElementById('iv-ask-view').classList.add('hidden');
      document.getElementById('iv-report-view').classList.add('hidden');
      document.getElementById('iv-setup-view').classList.remove('hidden');
    }

    function renderIvReport() {
      const valid = mockIv.results.filter(r => r);
      const avgDims = { structure: 0, tech: 0, logic: 0, quant: 0, length: 0 };
      valid.forEach(r => { Object.keys(avgDims).forEach(k => avgDims[k] += r.dims[k]); });
      Object.keys(avgDims).forEach(k => avgDims[k] = Math.round(avgDims[k] / Math.max(1, valid.length)));
      const total = Math.round(Object.values(avgDims).reduce((a, b) => a + b, 0) / 5);
      const g = gradeOf(total);

      document.getElementById('iv-ask-view').classList.add('hidden');
      document.getElementById('iv-report-view').classList.remove('hidden');
      document.getElementById('iv-report-meta').textContent = `${mockIv.job} · ${mockIv.type === 'technical' ? '技术面' : mockIv.type === 'behavioral' ? '行为面' : 'HR 面'} · 共 ${mockIv.questions.length} 题`;

      const totalEl = document.getElementById('iv-total');
      let cur = 0;
      const anim = setInterval(() => { cur += Math.max(1, Math.round((total - cur) / 4)); if (cur >= total) { cur = total; clearInterval(anim); } totalEl.textContent = cur; }, 30);
      const gEl = document.getElementById('iv-grade');
      gEl.textContent = g.grade + ' · ' + g.text;
      gEl.style.background = 'rgba(109,94,246,0.1)'; gEl.style.color = '#6d5ef6';
      document.getElementById('iv-grade-desc').textContent = g.desc;

      // 雷达
      const radar = echarts.init(document.getElementById('iv-radar'));
      radar.setOption({
        radar: {
          indicator: IV_RUBRIC.map(r => ({ name: r.name, max: 100 })),
          radius: '62%', center: ['50%', '52%'],
          axisName: { color: '#6b7280', fontSize: 10 },
          splitArea: { areaStyle: { color: ['rgba(14,165,183,0.03)', 'rgba(14,165,183,0.06)'] } },
          splitLine: { lineStyle: { color: '#e8e8ec' } },
          axisLine: { lineStyle: { color: '#e8e8ec' } }
        },
        series: [{
          type: 'radar', data: [{
            value: [avgDims.structure, avgDims.tech, avgDims.logic, avgDims.quant, avgDims.length],
            areaStyle: { color: 'rgba(14,165,183,0.25)' },
            lineStyle: { color: '#0ea5b7', width: 2 },
            itemStyle: { color: '#0ea5b7' }
          }]
        }]
      });

      // 维度明细
      const dimName = { structure: '结构清晰度', tech: '技术准确度', logic: '表达逻辑', quant: '量化具体性', length: '长度适宜' };
      document.getElementById('iv-dims').innerHTML = Object.keys(avgDims).map(k => {
        const v = avgDims[k];
        const color = v >= 80 ? '#10b981' : v >= 60 ? '#0ea5b7' : v >= 40 ? '#f59e0b' : '#ef4444';
        return `<div>
          <div class="flex items-center justify-between mb-1">
            <span class="font-semibold text-[13px] text-content-text">${dimName[k]}</span>
            <span class="font-display font-bold text-[14px]" style="color:${color}">${v}</span>
          </div>
          <div class="h-1.5 bg-content-bg rounded-full overflow-hidden"><div class="h-full rounded-full transition-all duration-700" style="width:${v}%;background:${color}"></div></div>
        </div>`;
      }).join('');

      // 逐题反馈
      document.getElementById('iv-q-feedback').innerHTML = mockIv.questions.map((q, i) => {
        const r = mockIv.results[i] || { total: 0, hit: 0, keysLen: q.keys.length };
        const ans = mockIv.answers[i] || '（已跳过）';
        const sc = r.total;
        const color = sc >= 80 ? '#10b981' : sc >= 60 ? '#0ea5b7' : sc >= 40 ? '#f59e0b' : '#ef4444';
        const fb = [];
        if (r.dims.tech < 60) fb.push(`技术要点覆盖不足（命中 ${r.hit}/${r.keysLen}），建议补充：${q.keys.slice(0, 4).join('、')}`);
        if (r.dims.structure < 60) fb.push('结构不够清晰，建议使用「总分总」或分点作答');
        if (r.dims.quant < 60) fb.push('缺少量化细节，建议补充具体数据与案例');
        if (r.dims.length < 60 && ans !== '（已跳过）') fb.push('回答长度不适宜，建议控制在 200-500 字');
        if (fb.length === 0) fb.push('回答质量良好，保持当前表达方式');
        return `<div class="rounded-xl border border-content-divider p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2"><span class="badge badge-cyan">Q${i + 1}</span><span class="text-[12px] font-semibold text-content-text">${q.tag}</span></div>
            <span class="font-display font-bold text-[14px]" style="color:${color}">${sc}</span>
          </div>
          <p class="text-[12px] text-content-text mb-2">${q.text}</p>
          <div class="text-[11px] text-content-sub bg-content-bg/50 rounded-lg p-2.5 mb-2 max-h-24 overflow-y-auto">${ans}</div>
          <div class="text-[11px] text-content-sub"><i class="fa-solid fa-circle-info mr-1 text-brand-purple"></i>${fb.join('；')}</div>
        </div>`;
      }).join('');

      // 综合建议
      const sugg = [];
      if (avgDims.structure < 70) sugg.push({ t: '强化答题结构', d: '面试答题建议采用「总-分-总」或 STAR 结构，先给结论再展开，最后收束。可在草稿纸上先列 2-3 个要点。' });
      if (avgDims.tech < 70) sugg.push({ t: '夯实技术深度', d: `针对 ${mockIv.job} 的核心知识点系统复习，重点关注本次未覆盖到的技术要点，结合项目实例阐述。` });
      if (avgDims.quant < 70) sugg.push({ t: '补充量化表达', d: '在描述经历与方案时，主动加入数字（提升比例、处理量级、耗时等），让回答更具说服力。' });
      if (avgDims.length < 70) sugg.push({ t: '控制答题篇幅', d: '练习在 200-500 字内完整表达一个观点，避免过短信息量不足或过长失去重点。' });
      if (avgDims.logic < 70) sugg.push({ t: '理顺因果逻辑', d: '多用「因为…所以…」「通过…实现…」等连接词，让因果链条清晰可见。' });
      if (sugg.length === 0) sugg.push({ t: '保持水准', d: '各维度表现均衡，建议针对具体岗位做真题模拟，进一步打磨细节。' });
      document.getElementById('iv-suggestions').innerHTML = sugg.map(s => `
        <div class="flex gap-3 p-3 rounded-xl" style="background:rgba(245,158,11,0.08)">
          <i class="fa-solid fa-circle-arrow-right text-state-warning mt-0.5 text-xs"></i>
          <div><div class="text-[13px] font-semibold text-content-text">${s.t}</div><div class="text-[12px] text-content-sub mt-0.5 leading-relaxed">${s.d}</div></div>
        </div>
      `).join('');

      showToast('面试评估报告已生成', 'check');
    }

    // ============ INTERVIEW HISTORY ============
    const INTERVIEW_HISTORY = [
      { id: 1, type: 'technical', job: '前端开发工程师', score: 82, grade: 'B', date: '2026-07-20', duration: '12分钟', status: 'completed' },
      { id: 2, type: 'behavioral', job: '前端开发工程师', score: 75, grade: 'B', date: '2026-07-18', duration: '15分钟', status: 'completed' },
      { id: 3, type: 'hr', job: '后端开发工程师', score: 68, grade: 'C', date: '2026-07-15', duration: '10分钟', status: 'completed' },
      { id: 4, type: 'technical', job: '数据分析师', score: 0, grade: '-', date: '2026-07-10', duration: '-', status: 'abandoned' },
    ];

    function renderInterviewHistory() {
      const container = document.getElementById('interview-history-list');
      if (!container) return;
      const typeLabels = { technical: '技术面', behavioral: '行为面', hr: 'HR 面' };
      const typeColors = { technical: '#3b82f6', behavioral: '#10b981', hr: '#f59e0b' };
      const gradeColors = { 'A': '#10b981', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#ef4444', '-': '#9ca3af' };
      if (INTERVIEW_HISTORY.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-illustration"><i class="fa-solid fa-microphone"></i></div><div class="empty-state-title">暂无面试记录</div><div class="empty-state-desc">开始一次 AI 模拟面试，记录你的成长轨迹</div></div>';
        return;
      }
      container.innerHTML = INTERVIEW_HISTORY.map((item, i) => {
        const color = typeColors[item.type] || '#6b7280';
        const gColor = gradeColors[item.grade] || '#9ca3af';
        const statusBadge = item.status === 'abandoned'
          ? '<span class="badge" style="background:rgba(156,163,175,0.15);color:#9ca3af;">已放弃</span>'
          : '<span class="badge" style="background:rgba(16,185,129,0.1);color:#10b981;">已完成</span>';
        return '<div class="rounded-xl border border-content-divider p-4 hover:border-brand-purple transition cursor-pointer" style="animation:fadeUp 0.4s ease ' + (i * 0.05) + 's backwards;" onclick="selectIvType(\'' + item.type + '\');switchPage(\'interview\')">' +
          '<div class="flex items-center justify-between gap-3 mb-2">' +
          '<div class="flex items-center gap-2">' +
          '<span class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:' + color + '15;color:' + color + ';"><i class="fa-solid fa-user-graduate text-sm"></i></span>' +
          '<div><div class="font-semibold text-sm text-content-text">' + item.job + '</div><div class="text-[11px] text-content-sub">' + typeLabels[item.type] + ' · ' + item.date + '</div></div>' +
          '</div>' +
          '<div class="text-right">' +
          (item.status === 'completed'
            ? '<div class="font-display font-bold text-lg" style="color:' + gColor + ';">' + item.score + '</div><div class="text-[10px] text-content-sub">等级 ' + item.grade + '</div>'
            : '<div class="text-lg text-content-sub">--</div><div class="text-[10px] text-content-sub">未完成</div>') +
          '</div>' +
          '</div>' +
          '<div class="flex items-center justify-between text-[11px] text-content-sub">' +
          '<span><i class="fa-regular fa-clock mr-1"></i>' + item.duration + '</span>' +
          statusBadge +
          '</div>' +
          '</div>';
      }).join('');
    }

    // ============ MARKET (岗位市场) ============
    const MARKET_JOBS = [
      { id: 1, title: '前端开发工程师', company: '字节跳动', city: '北京', salary: '25-40K', salaryMin: 25, salaryMax: 40, match: 92, tags: ['React', 'TypeScript', '前端工程化'], urgent: true, logo: '🎯', industry: '互联网', desc: '负责抖音电商平台前端开发，优化页面性能与用户体验' },
      { id: 2, title: '前端开发工程师', company: '腾讯', city: '深圳', salary: '22-35K', salaryMin: 22, salaryMax: 35, match: 88, tags: ['Vue', 'Node.js', 'Web 性能'], urgent: false, logo: '💬', industry: '互联网', desc: '参与微信小程序生态建设，负责开发者工具核心模块' },
      { id: 3, title: '全栈开发工程师', company: '美团', city: '北京', salary: '20-32K', salaryMin: 20, salaryMax: 32, match: 76, tags: ['React', 'Node.js', 'MySQL'], urgent: true, logo: '🍔', industry: '互联网', desc: '负责外卖 B 端商家系统全栈开发，微服务架构' },
      { id: 4, title: 'Web 前端工程师', company: '网易', city: '杭州', salary: '18-28K', salaryMin: 18, salaryMax: 28, match: 71, tags: ['JavaScript', 'Canvas', '动画'], urgent: false, logo: '🎮', industry: '游戏', desc: '负责游戏官网和社区前端，实现炫酷动效与交互' },
      { id: 5, title: '前端开发实习生', company: '小红书', city: '上海', salary: '300-400/天', salaryMin: 6, salaryMax: 8, match: 85, tags: ['React', 'TypeScript', '小程序'], urgent: true, logo: '📕', industry: '互联网', desc: '参与社区产品前端开发，实现瀑布流与笔记编辑器' },
      { id: 6, title: '高级前端工程师', company: '阿里巴巴', city: '杭州', salary: '30-50K', salaryMin: 30, salaryMax: 50, match: 65, tags: ['React', '微前端', '架构'], urgent: false, logo: '🛒', industry: '互联网', desc: '负责淘宝商家后台架构设计，微前端架构治理' },
      { id: 7, title: '前端开发工程师', company: '京东', city: '北京', salary: '20-35K', salaryMin: 20, salaryMax: 35, match: 82, tags: ['Vue', 'TypeScript', '京东小程序'], urgent: false, logo: '📦', industry: '互联网', desc: '参与京东零售业务前端开发，追求极致用户体验' },
      { id: 8, title: '前端开发工程师', company: '百度', city: '北京', salary: '18-30K', salaryMin: 18, salaryMax: 30, match: 78, tags: ['React', 'GraphQL', '大数据'], urgent: false, logo: '🔍', industry: '互联网', desc: '参与百度搜索前端开发，处理海量数据可视化' },
      { id: 9, title: '前端开发工程师', company: '拼多多', city: '上海', salary: '20-35K', salaryMin: 20, salaryMax: 35, match: 73, tags: ['React', 'WebView', '性能优化'], urgent: true, logo: '🛍️', industry: '互联网', desc: '负责移动端 H5 页面开发，极致性能优化' },
      { id: 10, title: '前端开发工程师', company: '滴滴', city: '北京', salary: '22-38K', salaryMin: 22, salaryMax: 38, match: 80, tags: ['React', '地图', '实时通信'], urgent: false, logo: '🚗', industry: '互联网', desc: '参与出行平台前端开发，处理实时定位与地图渲染' },
      { id: 11, title: '前端开发工程师', company: 'B 站', city: '上海', salary: '15-25K', salaryMin: 15, salaryMax: 25, match: 68, tags: ['Vue', '播放器', 'WebGL'], urgent: false, logo: '📺', industry: '互联网', desc: '负责视频播放器前端开发，优化弹幕体验' },
      { id: 12, title: '远程前端工程师', company: 'GitLab', city: '远程', salary: '25-45K', salaryMin: 25, salaryMax: 45, match: 70, tags: ['React', '开源', 'DevOps'], urgent: false, logo: '🌍', industry: 'SaaS', desc: '远程协作，参与开源 DevOps 平台前端开发' },
    ];

    const INDUSTRY_STATS = [
      { name: '互联网', count: 4856, avgSalary: 28.5, color: '#3b82f6', icon: 'fa-globe' },
      { name: '游戏', count: 1256, avgSalary: 32.0, color: '#8b5cf6', icon: 'fa-gamepad' },
      { name: 'SaaS', count: 856, avgSalary: 35.2, color: '#06b6d4', icon: 'fa-cloud' },
      { name: '金融科技', count: 623, avgSalary: 38.8, color: '#10b981', icon: 'fa-coins' },
      { name: '电商', count: 2156, avgSalary: 24.6, color: '#f59e0b', icon: 'fa-store' },
      { name: '教育', count: 432, avgSalary: 18.5, color: '#ec4899', icon: 'fa-graduation-cap' },
    ];

    let marketFilteredJobs = [];

    function initMarketPage() {
      const targetJob = document.getElementById('market-target-job');
      if (targetJob && currentAccount) {
        targetJob.textContent = currentAccount.target || '前端开发工程师';
      }
      marketFilteredJobs = [...MARKET_JOBS];
      renderMarketJobs();
      updateMarketStats();
      renderIndustryList();
      initMarketCharts();
    }

    function renderMarketJobs() {
      const container = document.getElementById('job-list');
      const emptyEl = document.getElementById('job-empty');
      const countEl = document.getElementById('result-count');
      if (!container) return;

      if (marketFilteredJobs.length === 0) {
        container.innerHTML = '';
        emptyEl.classList.remove('hidden');
        countEl.textContent = '找到 0 个岗位';
        return;
      }

      emptyEl.classList.add('hidden');
      countEl.textContent = `找到 ${marketFilteredJobs.length} 个岗位`;

      container.innerHTML = marketFilteredJobs.map((job, i) => {
        const matchColor = job.match >= 80 ? '#10b981' : job.match >= 60 ? '#3b82f6' : '#f59e0b';
        const matchBg = job.match >= 80 ? 'rgba(16,185,129,0.1)' : job.match >= 60 ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)';
        const tier = job.match >= 80 ? '高度匹配' : job.match >= 60 ? '较好匹配' : '潜力岗位';
        return `
          <div class="card card-glow-hover p-4 cursor-pointer" style="animation: fadeUp 0.4s ease ${i * 0.05}s backwards;">
            <div class="flex items-center gap-4">
              <!-- Left: Logo -->
              <div class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm" style="background: ${matchBg}">
                ${job.logo}
              </div>
              
              <!-- Middle: Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1.5">
                  <h3 class="font-display font-bold text-base text-content-text truncate">${job.title}</h3>
                  ${job.urgent ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium flex-shrink-0">急招</span>' : ''}
                </div>
                <div class="flex items-center gap-2 text-[13px] mb-1">
                  <span class="font-medium text-content-text truncate">${job.company}</span>
                  <span class="text-content-muted">·</span>
                  <span class="text-content-sub">${job.city}</span>
                  <span class="text-content-muted">·</span>
                  <span class="font-display font-bold text-brand-purple text-[15px]">${job.salary}</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  ${job.tags.map(t => `<span class="text-[11px] px-2 py-0.5 rounded-full" style="background:#f3f4f6;color:#4b5563">${t}</span>`).join('')}
                </div>
              </div>
              
              <!-- Right: Match -->
              <div class="flex-shrink-0 text-right pl-3 border-l border-content-divider">
                <div class="font-display font-extrabold text-2xl" style="color: ${matchColor}">${job.match}%</div>
                <div class="text-[10px] text-content-sub font-medium">${tier}</div>
                <div class="mt-1 px-2 py-0.5 rounded-full inline-block" style="background:${matchBg}">
                  <span class="text-[10px] font-bold" style="color:${matchColor}">匹配度</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function filterMarketJobs() {
      const search = (document.getElementById('market-search')?.value || '').trim().toLowerCase();
      const city = document.getElementById('filter-city')?.value || '';
      const salaryRange = document.getElementById('filter-salary')?.value || '';
      const minMatch = parseInt(document.getElementById('filter-match')?.value || '0');
      const sortBy = document.getElementById('sort-by')?.value || 'match';

      marketFilteredJobs = MARKET_JOBS.filter(job => {
        if (search) {
          const hay = (job.title + job.company + job.tags.join(' ')).toLowerCase();
          if (!hay.includes(search)) return false;
        }
        if (city && job.city !== city) return false;
        if (salaryRange) {
          const [min, max] = salaryRange.split('-').map(Number);
          const avg = (job.salaryMin + job.salaryMax) / 2;
          if (avg < min || (max < 999 && avg > max)) return false;
        }
        if (job.match < minMatch) return false;
        return true;
      });

      switch (sortBy) {
        case 'salary-high':
          marketFilteredJobs.sort((a, b) => b.salaryMax - a.salaryMax);
          break;
        case 'salary-low':
          marketFilteredJobs.sort((a, b) => a.salaryMin - b.salaryMin);
          break;
        case 'urgent':
          marketFilteredJobs.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || b.match - a.match);
          break;
        default:
          marketFilteredJobs.sort((a, b) => b.match - a.match);
      }

      renderMarketJobs();
      updateMarketStats();
    }

    function resetMarketFilter() {
      const searchEl = document.getElementById('market-search');
      if (searchEl) searchEl.value = '';
      ['filter-city', 'filter-salary', 'filter-match'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const sortEl = document.getElementById('sort-by');
      if (sortEl) sortEl.value = 'match';
      marketFilteredJobs = [...MARKET_JOBS];
      renderMarketJobs();
      updateMarketStats();
      showToast('筛选条件已重置', 'info');
    }

    function refreshMarket() {
      showToast('正在刷新岗位数据...', 'robot');
      setTimeout(() => {
        marketFilteredJobs = [...MARKET_JOBS];
        renderMarketJobs();
        updateMarketStats();
        showToast('数据已更新', 'check');
      }, 800);
    }

    function openMarketFilter() {
      showToast('筛选面板开发中', 'info');
    }

    function updateMarketStats() {
      const total = marketFilteredJobs.length;
      const avgSalary = total > 0
        ? Math.round(marketFilteredJobs.reduce((s, j) => s + (j.salaryMin + j.salaryMax) / 2, 0) / total)
        : 0;
      const maxSalary = total > 0
        ? marketFilteredJobs.reduce((max, j) => j.salaryMax > max.salaryMax ? j : max, marketFilteredJobs[0])
        : { salaryMax: 0, company: '--' };
      const highMatch = marketFilteredJobs.filter(j => j.match >= 80).length;
      const urgent = marketFilteredJobs.filter(j => j.urgent).length;

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('stat-total', total);
      set('stat-avg-salary', avgSalary);
      set('stat-max-salary', maxSalary.salaryMax);
      set('stat-max-company', maxSalary.company);
      set('stat-high-match', highMatch);
      set('stat-urgent', urgent);
    }

    function renderIndustryList() {
      const container = document.getElementById('industry-list');
      if (!container) return;

      const maxCount = Math.max(...INDUSTRY_STATS.map(i => i.count));

      container.innerHTML = INDUSTRY_STATS.map((ind, i) => `
        <div class="flex items-center gap-4 p-3 rounded-xl hover:bg-content-bg/50 transition">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style="background: ${ind.color}15; color: ${ind.color}">
            <i class="fa-solid ${ind.icon}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <span class="font-semibold text-sm text-content-text">${ind.name}</span>
              <div class="flex items-center gap-3 text-[12px]">
                <span class="text-content-sub">${ind.count.toLocaleString()} 个岗位</span>
                <span class="font-semibold" style="color: ${ind.color}">${ind.avgSalary}K 平均</span>
              </div>
            </div>
            <div class="h-1.5 bg-content-bg rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all" style="width: ${(ind.count / maxCount * 100).toFixed(1)}%; background: ${ind.color}"></div>
            </div>
          </div>
        </div>
      `).join('');
    }

    function initMarketCharts() {
      // 薪资趋势图 - 面积图，紫色渐变
      const trendEl = document.getElementById('market-chart-trend');
      if (trendEl && !charts.market) {
        const trendChart = echarts.init(trendEl);
        const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        const salaries = [22, 23, 24, 25, 26, 27, 28, 28.5, 29, 29.5, 30, 31];

        trendChart.setOption({
          grid: { top: 15, right: 15, bottom: 25, left: 45 },
          tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#6D5EF6', textStyle: { color: '#f1f5f9', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15)' },
          xAxis: {
            type: 'category',
            data: months,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: '#94a3b8', fontSize: 10 }
          },
          yAxis: {
            type: 'value',
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}K' }
          },
          series: [{
            type: 'line',
            data: salaries,
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            showSymbol: false,
            lineStyle: { color: '#6D5EF6', width: 3, shadowColor: 'rgba(109,94,246,0.5)', shadowBlur: 10 },
            itemStyle: { color: '#6D5EF6', borderColor: '#fff', borderWidth: 3 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(109,94,246,0.4)' },
                { offset: 0.5, color: 'rgba(14,165,183,0.2)' },
                { offset: 1, color: 'rgba(14,165,183,0.02)' }
              ])
            },
            emphasis: {
              focus: 'series',
              itemStyle: { borderWidth: 4 }
            }
          }]
        });

        // 城市薪资分布图 - 圆角柱状图，渐变配色
        const cityEl = document.getElementById('market-chart-city');
        if (cityEl) {
          const cityChart = echarts.init(cityEl);
          const cities = ['北京', '上海', '深圳', '杭州', '广州', '成都', '远程'];
          const citySalaries = [32, 30, 33, 28, 25, 22, 35];

          cityChart.setOption({
            grid: { top: 15, right: 15, bottom: 25, left: 55 },
            tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#0EA5B7', textStyle: { color: '#f1f5f9', fontSize: 12 }, extraCssText: 'border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15)' },
            xAxis: {
              type: 'category',
              data: cities,
              axisLine: { show: false },
              axisTick: { show: false },
              axisLabel: { color: '#94a3b8', fontSize: 10 }
            },
            yAxis: {
              type: 'value',
              axisLine: { show: false },
              axisTick: { show: false },
              splitLine: { show: false },
              axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}K' }
            },
            series: [{
              type: 'bar',
              data: citySalaries.map(v => ({
                value: v,
                itemStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: '#6D5EF6' },
                    { offset: 1, color: '#0EA5B7' }
                  ]),
                  borderRadius: [8, 8, 4, 4],
                  shadowColor: 'rgba(109,94,246,0.3)',
                  shadowBlur: 10,
                  shadowOffsetY: 4
                }
              })),
              barWidth: '55%',
              emphasis: {
                itemStyle: {
                  shadowColor: 'rgba(109,94,246,0.5)',
                  shadowBlur: 15
                }
              }
            }]
          });

          charts.market = { trend: trendChart, city: cityChart };
        } else {
          charts.market = { trend: trendChart };
        }
      }
    }

    function initInterviewHistoryChart() {
      const el = document.getElementById('iv-history-chart');
      if (!el || charts.interview) return;
      const chart = echarts.init(el);
      const scores = [62, 65, 68, 72, 70, 75, 78, 72];
      chart.setOption({
        grid: { top: 5, right: 5, bottom: 5, left: 5 },
        xAxis: { type: 'category', show: false, data: scores.map((_, i) => i) },
        yAxis: { type: 'value', show: false, min: 50, max: 100 },
        series: [{
          type: 'line',
          data: scores,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#6D5EF6', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(109,94,246,0.3)' },
              { offset: 1, color: 'rgba(109,94,246,0)' }
            ])
          }
        }]
      });
      charts.interview = chart;
    }

    // ============ HEATMAP RENDERING (GitHub-style) ============
    function renderHeatmap(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const WEEKS = 53;
      const DAYS = 7;
      const levels = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'];
      let html = '<div class="heatmap-container" style="padding:8px 0;">';
      html += '<div class="heatmap-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:11px;color:#6b7280;">';
      html += '<span>学习活跃度热力图（最近一年）</span>';
      html += '<span class="heatmap-legend">';
      html += '<span>少</span>';
      levels.forEach(l => { html += '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + l + ';margin:0 1px;"></span>'; });
      html += '<span>多</span>';
      html += '</span></div>';
      html += '<div class="heatmap-grid" style="display:grid;grid-template-columns:repeat(' + WEEKS + ',1fr);gap:3px;">';
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - (WEEKS * DAYS - 1));
      let totalCells = 0;
      let activeCells = 0;
      for (let w = 0; w < WEEKS; w++) {
        for (let d = 0; d < DAYS; d++) {
          const cellDate = new Date(startDate);
          cellDate.setDate(cellDate.getDate() + (w * DAYS + d));
          if (cellDate > today) continue;
          totalCells++;
          const dayOfWeek = cellDate.getDay();
          const isFuture = cellDate > today;
          let level = 0;
          if (!isFuture) {
            const seed = (cellDate.getFullYear() * 10000 + cellDate.getMonth() * 100 + cellDate.getDate()) % 100;
            if (seed < 30) level = 0;
            else if (seed < 55) level = 1;
            else if (seed < 75) level = 2;
            else if (seed < 90) level = 3;
            else level = 4;
            if (level > 0) activeCells++;
          }
          const bg = isFuture ? 'transparent' : levels[level];
          const title = cellDate.getFullYear() + '-' + String(cellDate.getMonth() + 1).padStart(2, '0') + '-' + String(cellDate.getDate()).padStart(2, '0') + (level > 0 ? ' · ' + level + ' 次学习' : ' · 无学习记录');
          html += '<div class="heatmap-cell" title="' + title + '" style="width:10px;height:10px;border-radius:2px;background:' + bg + ';cursor:pointer;transition:transform 0.15s;" onmouseenter="this.style.transform=\'scale(1.3)\'" onmouseleave="this.style.transform=\'scale(1)\'"></div>';
        }
      }
      html += '</div>';
      html += '<div class="heatmap-footer" style="margin-top:8px;font-size:11px;color:#6b7280;">共 ' + totalCells + ' 天，其中 ' + activeCells + ' 天有学习记录</div>';
      html += '</div>';
      container.innerHTML = html;
    }

    // ============ AI Floating Assistant 小职助手 ============
    const ASSISTANT_CONTEXT = {
      dashboard: {
        hint: '当前在工作台 📊 这里可以查看你的整体进展和数据概览',
        tips: ['如何提升匹配度？', '今日有哪些任务？', '如何查看详细报告？'],
        intro: '工作台是你的每日起点，在这里可以看到匹配度、待办任务和能力雷达图。点击卡片可以跳转到对应功能页面。'
      },
      planning: {
        hint: '当前在职业规划 🎯 这里可以设置你的目标岗位',
        tips: ['如何选择目标岗位？', '岗位前景如何？', '匹配度怎么算？'],
        intro: '职业规划页面帮你通过 AI 引导选择目标岗位。输入兴趣方向，AI 会为你推荐适合的岗位，并展示能力差距。'
      },
      resume: {
        hint: '当前在理想简历 📝 这里可以生成你的目标简历',
        tips: ['如何优化简历？', 'ATS 评分标准是什么？', '如何补充经历？'],
        intro: '理想简历让你对比「目标简历」与「现状简历」的差距。填写信息后，AI 会进行 ATS 评分并给出优化建议。'
      },
      diagnosis: {
        hint: '当前在技能诊断 🔍 这里可以分析你的能力差距',
        tips: ['如何提升技能？', '雷达图怎么看？', '应该先学什么？'],
        intro: '技能诊断从五个维度评估你的能力：技术能力、项目经验、知识储备、软实力和行业理解。对比目标岗位要求，明确提升方向。'
      },
      tasks: {
        hint: '当前在任务中心 ✅ 这里可以完成学习任务',
        tips: ['任务怎么提交？', 'A类和B类任务区别？', '如何获得高分？'],
        intro: '任务中心提供闯关式学习路径。A 类任务是代码提交（需通过 AI 评估），B 类任务是报告/文档提交。完成任务可以提升匹配度。'
      },
      assessment: {
        hint: '当前在职业测评 🧠 这里可以了解你的职业倾向',
        tips: ['测评有什么用？', '如何选择答案？', '结果怎么看？'],
        intro: '职业测评通过一系列问题分析你的兴趣、性格和价值观，帮你找到最适合的职业方向。建议认真作答，结果仅供参考。'
      },
      interview: {
        hint: '当前在 AI 模拟面试 🎤 这里可以练习面试',
        tips: ['有哪些面试类型？', '评分标准是什么？', '如何准备面试？'],
        intro: 'AI 模拟面试提供技术面、行为面和 HR 面三种类型。AI 会根据你的回答从五个维度评分并给出详细反馈。'
      },
      profile: {
        hint: '当前在个人中心 👤 这里可以管理你的信息',
        tips: ['如何修改资料？', '如何重置进度？', '数据会保存吗？'],
        intro: '个人中心展示和管理你的所有信息，包括基本资料、学习进度和职业目标。数据会自动保存在本地。'
      },
      market: {
        hint: '当前在岗位市场 💼 这里可以查看招聘信息',
        tips: ['如何筛选岗位？', '薪资范围怎么看？', '如何投递简历？'],
        intro: '岗位市场展示了与你目标岗位相关的招聘信息，可以按薪资、城市、匹配度等条件筛选。点击岗位卡片可查看详情。'
      }
    };

    let assistantState = {
      visible: false,
      minimized: false,
      msgCount: 0,
      contextPage: 'dashboard'
    };

    function toggleAssistant() {
      const wrapper = document.getElementById('ai-assistant');
      const panel = document.getElementById('ai-assistant-panel');
      if (!wrapper) return;

      if (wrapper.classList.contains('hidden')) {
        // First time show
        wrapper.classList.remove('hidden');
        if (panel) panel.classList.remove('hidden');
        assistantState.visible = true;
        updateAssistantContext();
        showAssistantWelcome();
      } else {
        // Toggle panel
        if (panel.classList.contains('hidden')) {
          panel.classList.remove('hidden');
          assistantState.minimized = false;
          updateAssistantContext();
        } else {
          panel.classList.add('hidden');
        }
      }
    }

    function minimizeAssistant() {
      const panel = document.getElementById('ai-assistant-panel');
      if (panel) {
        panel.classList.add('hidden');
      }
    }

    function showAssistantWelcome() {
      const ctx = ASSISTANT_CONTEXT[assistantState.contextPage] || ASSISTANT_CONTEXT.dashboard;
      const msgs = document.getElementById('ai-panel-messages');
      if (!msgs || assistantState.msgCount > 0) return;

      const welcomeMsg = msgs.querySelector('#ai-welcome-msg');
      if (welcomeMsg) {
        welcomeMsg.innerHTML = `你好，欢迎回来 👋<br><br>${ctx.intro}<br><br>有任何问题都可以问我，或者点击下方快捷提问。`;
      }
      renderAssistantQuickReplies();
    }

    function updateAssistantContext() {
      const activePage = document.querySelector('.page.active');
      const pageId = activePage ? activePage.id.replace('page-', '') : 'dashboard';
      assistantState.contextPage = pageId;

      const ctx = ASSISTANT_CONTEXT[pageId] || ASSISTANT_CONTEXT.dashboard;
      const hintEl = document.getElementById('ai-context-text');
      if (hintEl) hintEl.textContent = ctx.hint;

      renderAssistantQuickReplies();
    }

    function renderAssistantQuickReplies() {
      const ctx = ASSISTANT_CONTEXT[assistantState.contextPage] || ASSISTANT_CONTEXT.dashboard;
      const quickEl = document.getElementById('ai-panel-quick');
      if (!quickEl) return;

      const extras = assistantState.msgCount === 0 ? ['告诉我更多', '联系人工客服'] : ['还有其他问题', '我明白了'];
      const all = [...ctx.tips, ...extras];

      quickEl.innerHTML = all.map((text, i) => {
        const cls = i === 0 ? 'ai-quick-chip primary' : 'ai-quick-chip';
        return `<span class="${cls}" onclick="sendAssistantMsg('${text.replace(/'/g, "\\'")}')">${text}</span>`;
      }).join('');
    }

    function addAssistantMsg(text, isUser) {
      const msgs = document.getElementById('ai-panel-messages');
      if (!msgs) return;

      const avatar = isUser
        ? '<div class="ai-avatar human"><i class="fa-solid fa-user"></i></div>'
        : '<div class="ai-avatar bot"><i class="fa-solid fa-robot"></i></div>';
      const cls = isUser ? 'ai-msg user' : 'ai-msg bot';

      msgs.innerHTML += `<div class="${cls}">${avatar}<div class="ai-bubble">${text}</div></div>`;
      msgs.scrollTop = msgs.scrollHeight;
    }

    function showAssistantTyping() {
      const msgs = document.getElementById('ai-panel-messages');
      if (!msgs) return;
      const id = 'ai-typing-' + Date.now();
      msgs.innerHTML += `<div class="ai-msg bot" id="${id}"><div class="ai-avatar bot"><i class="fa-solid fa-robot"></i></div><div class="ai-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div></div>`;
      msgs.scrollTop = msgs.scrollHeight;
      return id;
    }

    function removeAssistantTyping(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    async function sendAssistantMsg(presetText) {
      const input = document.getElementById('ai-panel-input');
      const text = presetText || (input ? input.value.trim() : '');
      if (!text) return;

      addAssistantMsg(text, true);
      if (input) input.value = '';

      const typingId = showAssistantTyping();

      // Generate context-aware response
      let response = '';
      const ctx = ASSISTANT_CONTEXT[assistantState.contextPage] || ASSISTANT_CONTEXT.dashboard;

      // Try AI API first, fallback to local
      if (typeof proxyAvailable !== 'undefined' && (proxyAvailable || (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.apiKey))) {
        try {
          const apiReply = await callAIAPI(`[助手引导] 用户在"${PAGE_LABELS[assistantState.contextPage] || assistantState.contextPage}"页面问：${text}`);
          if (apiReply) {
            response = apiReply;
          }
        } catch (e) {
          console.warn('Assistant AI call failed:', e);
        }
      }

      if (!response) {
        response = getAssistantFallback(text, assistantState.contextPage, ctx);
      }

      removeAssistantTyping(typingId);
      addAssistantMsg(response, false);

      assistantState.msgCount++;
      renderAssistantQuickReplies();
    }

    function getAssistantFallback(text, pageId, ctx) {
      const name = currentAccount?.name || '同学';
      const target = currentAccount?.target || '目标岗位';

      // Greeting
      if (/你好|hi|hello|在吗/.test(text.toLowerCase())) {
        return `你好${name}！我是小职 ✨ 我现在在「${PAGE_LABELS[pageId] || pageId}」页面为你服务。${ctx.intro}`;
      }

      // Help / How to start
      if (/怎么|如何|怎样|教程|引导|使用|开始|上手/.test(text)) {
        return `好的，让我来引导你。\n\n${ctx.intro}\n\n你可以试试：${ctx.tips.join('、')}。\n需要我帮你跳转到相关功能吗？`;
      }

      // Specific page questions
      if (pageId === 'dashboard' && /匹配度/.test(text)) {
        return `匹配度是根据你的技能、项目经历与目标岗位「${target}」的 JD 关键词对比计算的。想提升匹配度，可以：\n1. 在「技能诊断」查看差距\n2. 在「任务中心」完成对应任务\n3. 在「理想简历」补充相关经历\n\n要帮你跳转到技能诊断吗？`;
      }

      if (pageId === 'resume' && /ATS|评分/.test(text)) {
        return `ATS 评分从五个维度评估你的简历：\n• 结构完整度 (20%)\n• 关键词匹配 (30%)\n• 量化成果 (20%)\n• 内容充实度 (15%)\n• 格式规范 (15%)\n\n70 分以上基本可通过 ATS 筛选，85 分以上为优秀。`;
      }

      if (pageId === 'tasks' && /A类|B类|区别|怎么/.test(text)) {
        return `A 类任务是代码提交类，需要上传 GitHub 链接或粘贴代码，AI 会自动评估质量。\nB 类任务是报告/文档类，提交后由 AI 评分。\n\n两类任务都可以获得经验值，完成后匹配度会相应提升。`;
      }

      if (pageId === 'interview' && /类型|面/.test(text)) {
        return `我们提供三种面试类型：\n• 技术面 — 考察专业知识和算法\n• 行为面 — 考察团队协作和软素质\n• HR 面 — 考察求职动机和文化匹配\n\n每种类型 5 题，AI 从结构、技术、逻辑、量化、长度五个维度评分。`;
      }

      // Salary/Job questions
      if (/薪资|工资|待遇|收入/.test(text)) {
        return `根据平台数据，应届生起薪普遍在 15-25K 之间（因城市和岗位而异）。建议先在「岗位市场」查看具体岗位的薪资范围，再设定合理预期。`;
      }

      if (/岗位|工作|职业|方向/.test(text)) {
        return `关于职业方向选择，建议你：\n1. 先在「职业测评」了解你的兴趣和优势\n2. 在「职业规划」通过 AI 引导选择岗位\n3. 在「岗位市场」查看真实招聘信息\n\n需要帮你跳转到对应页面吗？`;
      }

      // Generic
      const genericResponses = [
        `这是个好问题！在「${PAGE_LABELS[pageId] || pageId}」页面，你可以这样操作... 如果需要更详细的引导，我可以一步步带你走。`,
        `明白了！简单来说，这个功能的作用是：${ctx.intro} 还有什么想了解的吗？`,
        `好的，我来帮你。你可以尝试以下操作：${ctx.tips.slice(0, 2).join('、')}。需要我详细说明吗？`,
        `收到！如果你是第一次使用这个功能，建议先了解整体流程。我可以为你提供完整引导，随时告诉我你想了解哪部分。`
      ];
      return genericResponses[Math.floor(Math.random() * genericResponses.length)];
    }

    // Expose assistant functions globally
    window.toggleAssistant = toggleAssistant;
    window.minimizeAssistant = minimizeAssistant;
    window.sendAssistantMsg = sendAssistantMsg;

    // Auto-show assistant on first visit
    function maybeShowAssistantOnLogin() {
      const shown = localStorage.getItem('assistant_shown');
      if (!shown) {
        setTimeout(() => {
          toggleAssistant();
          // Show a tip
          setTimeout(() => {
            showToast('💡 小职助手来啦！有问题随时问我', 'info');
          }, 500);
        }, 1500);
        localStorage.setItem('assistant_shown', '1');
      }
    }

    // Hook into page switching to update context
    const originalSwitchPage = window.switchPage;
    window.switchPage = function(pageId) {
      if (originalSwitchPage) originalSwitchPage(pageId);
      if (assistantState.visible) {
        assistantState.contextPage = pageId;
        setTimeout(updateAssistantContext, 100);
      }
    };

    // Hook into login to show assistant
    const originalDoLogin = window.doLogin;
    window.doLogin = function() {
      if (originalDoLogin) originalDoLogin();
      setTimeout(maybeShowAssistantOnLogin, 500);
    };

    // ============ INIT ============
    window.addEventListener('load', async () => {
      // 等待所有 page/modal 片段加载完成后再初始化
      await window.__fragmentsReady;
      // 绑定依赖 modal DOM 的全局事件（fragments 加载完成后才能绑定）
      document.getElementById('submit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'submit-modal') closeSubmitModal();
      });
      document.getElementById('confirm-ok').addEventListener('click', () => {
        closeModal('confirm-modal');
        if (typeof confirmCallback === 'function') { const cb = confirmCallback; confirmCallback = null; cb(); }
      });
      // 绑定所有 modal 的 overlay 点击关闭
      document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.addEventListener('click', (e) => {
          if (e.target === ov) {
            ov.classList.remove('show');
            document.body.style.overflow = '';
          }
        });
      });
      // 绑定 chip 标签切换（排除带 data-filter 的筛选芯片，它们由 toggleTaskFilter 处理）
      document.querySelectorAll('.chip').forEach(chip => {
        if (chip.textContent.trim() === '+ 添加') return;
        if (chip.hasAttribute('data-filter')) return;
        chip.addEventListener('click', () => chip.classList.toggle('selected'));
      });
      renderAccountList();
      applyAccountToUI();
      updateAIStatusBadge();
      checkProxy();
      renderIvRubricPreview();
      
      // ============ 初始化统一样式组件 ============
      initUnifiedComponents();
      
      initPlanPageKeyboard();
      renderInterviewHistory();
    });

    // ============ 统一样式组件初始化 ============
    function initUnifiedComponents() {
      // --- 注册页头像上传（圆形设计） ---
      initRegisterAvatar();

      // --- 注册页实时表单校验 ---
      initRegisterFormValidation();

      // --- 登录页密码强度 ---
      initLoginPasswordStrength();

      // --- 个人简介字数统计 ---
      initBioCharCounter();

      // --- 初始化职业规划页面的年级下拉框 ---
      const gradeSelector = document.getElementById('grade-selector');
      if (gradeSelector && window.UnifiedSelect) {
        const gradeSelect = new window.UnifiedSelect(gradeSelector, {
          placeholder: '请选择年级',
          value: gradeSelector.dataset.value || '大三',
          options: (window.APP_OPTIONS || {}).GRADE_OPTIONS || [],
          searchable: true,
          onChange: (val) => {
            if (currentAccount) currentAccount.grade = val;
          }
        });
      }
      
      // 初始化职业规划页面的学校联想
      const schoolSearch = document.getElementById('school-search');
      if (schoolSearch && window.SchoolSearchSelect) {
        const schoolSelect = new window.SchoolSearchSelect(schoolSearch, {
          placeholder: '输入或选择学校名称',
          onChange: (val) => {
            if (currentAccount) currentAccount.school = val;
          }
        });
      }
      
      // 初始化职业规划页面的专业联想
      const majorSearch = document.getElementById('major-search');
      if (majorSearch && window.MajorSearchSelect) {
        const majorSelect = new window.MajorSearchSelect(majorSearch, {
          placeholder: '输入或选择专业名称',
          onChange: (val) => {
            if (currentAccount) currentAccount.major = val;
          }
        });
      }
      
      // 初始化简历页面的省份-城市联动下拉框
      const resumeProvinceSelector = document.getElementById('r-province-selector');
      const resumeCitySelector2 = document.getElementById('r-city-selector');
      const PC_DATA = (window.APP_OPTIONS || {}).PROVINCE_CITY_DATA || [];

      function getCitiesByProvince(provinceName) {
        const found = PC_DATA.find(item => item.province === provinceName);
        if (!found) return [];
        return found.cities.map(c => ({ value: c, label: c }));
      }

      if (resumeCitySelector2 && window.UnifiedSelect) {
        // 先初始化城市下拉框（空选项，待省份选中后填充）
        resumeCitySelector2._select = new window.UnifiedSelect(resumeCitySelector2, {
          placeholder: '先选省份，再选城市',
          value: '',
          options: [],
          searchable: true,
          showCustom: true,
          customPlaceholder: '输入其他城市',
          onChange: (val) => {
            const el = document.getElementById('r-city');
            if (el) el.value = val;
          }
        });
      }

      if (resumeProvinceSelector && window.UnifiedSelect) {
        resumeProvinceSelector._select = new window.UnifiedSelect(resumeProvinceSelector, {
          placeholder: '请选择省份',
          value: '',
          options: (window.APP_OPTIONS || {}).PROVINCE_OPTIONS || [],
          searchable: true,
          onChange: (val) => {
            const pEl = document.getElementById('r-province');
            if (pEl) pEl.value = val;
            // 联动：更新城市下拉框选项
            if (resumeCitySelector2 && resumeCitySelector2._select) {
              const cityOptions = getCitiesByProvince(val);
              // 清除当前城市值并更新选项
              resumeCitySelector2._select.options = cityOptions;
              resumeCitySelector2._select.setValue('');
              if (cityOptions.length === 0) {
                resumeCitySelector2._select.placeholder = '先选省份，再选城市';
              } else {
                resumeCitySelector2._select.placeholder = '请选择城市';
              }
              resumeCitySelector2._select.placeholderEl.textContent = resumeCitySelector2._select.placeholder;
              resumeCitySelector2._select.placeholderEl.classList.add('unified-select-placeholder');
              resumeCitySelector2._select.renderOptions();
            }
          }
        });
      }
      
      // 初始化个人中心的年级下拉框
      const profileGradeSelector = document.getElementById('profile-grade-selector');
      if (profileGradeSelector && window.UnifiedSelect) {
        new window.UnifiedSelect(profileGradeSelector, {
          placeholder: '请选择年级',
          value: currentAccount ? currentAccount.grade : '',
          options: (window.APP_OPTIONS || {}).GRADE_OPTIONS || [],
          searchable: true,
          onChange: (val) => {
            const el = document.getElementById('form-grade');
            if (el) el.value = val;
          }
        });
      }
      
      // 初始化个人中心的目标岗位下拉框
      const targetSelector = document.getElementById('target-selector');
      if (targetSelector && window.UnifiedSelect) {
        new window.UnifiedSelect(targetSelector, {
          placeholder: '请选择目标岗位',
          value: currentAccount ? currentAccount.target : '',
          options: (window.APP_OPTIONS || {}).TARGET_POSITIONS.map(p => ({ value: p, label: p })),
          searchable: true,
          showCustom: true,
          customPlaceholder: '输入自定义岗位',
          onChange: (val) => {
            const el = document.getElementById('form-target');
            if (el) el.value = val;
          }
        });
      }
      
      // 初始化个人中心的学校联想
      const profileSchoolSearch = document.getElementById('profile-school-search');
      if (profileSchoolSearch && window.SchoolSearchSelect) {
        new window.SchoolSearchSelect(profileSchoolSearch, {
          placeholder: '输入或选择学校名称',
          value: currentAccount ? currentAccount.school : '',
          onChange: (val) => {
            const el = document.getElementById('form-school');
            if (el) el.value = val;
          }
        });
      }
      
      // 初始化个人中心的专业联想
      const profileMajorSearch = document.getElementById('profile-major-search');
      if (profileMajorSearch && window.MajorSearchSelect) {
        new window.MajorSearchSelect(profileMajorSearch, {
          placeholder: '输入或选择专业名称',
          value: currentAccount ? currentAccount.major : '',
          onChange: (val) => {
            const el = document.getElementById('form-major');
            if (el) el.value = val;
          }
        });
      }
      
      // 初始化注册页的年级下拉框
      const regGradeSelector = document.getElementById('reg-grade-selector');
      if (regGradeSelector && window.UnifiedSelect) {
        new window.UnifiedSelect(regGradeSelector, {
          placeholder: '请选择年级',
          options: (window.APP_OPTIONS || {}).GRADE_OPTIONS || [],
          searchable: true,
          onChange: (val) => {
            const el = document.getElementById('reg-grade');
            if (el) el.value = val;
            validateFormField('grade', val);
          }
        });
      }
      
      // 初始化个人中心头像上传（自定义圆形+悬浮相机）
      const profileAvatarContainer = document.getElementById('profile-avatar-uploader');
      const profileCameraBtn = document.getElementById('profile-avatar-camera');
      const profileFileInput = document.getElementById('profile-avatar-file');
      const profileImg = document.getElementById('profile-avatar-img');
      const profileInitials = document.getElementById('profile-avatar-initials');
      const profilePlaceholder = document.getElementById('profile-avatar-placeholder');
      
      if (profileAvatarContainer && profileFileInput) {
        // 全局可用的头像设置函数
        window.setProfileAvatar = function(dataUrl) {
          if (!dataUrl || typeof dataUrl !== 'string') {
            console.warn('[Profile] setProfileAvatar: invalid dataUrl');
            return;
          }
          
          // 1. 更新全局状态
          if (currentAccount) {
            currentAccount.avatar = dataUrl;
            saveState();
          }
          
          // 2. 更新 Profile 页面 DOM
          if (profileImg) {
            profileImg.src = dataUrl;
            profileImg.style.display = 'block';
            profileImg.style.visibility = 'visible';
          }
          profileAvatarContainer.classList.add('has-avatar');
          if (profilePlaceholder) {
            profilePlaceholder.style.display = 'none';
          }
          
          // 3. 更新 Sidebar 头像
          const sidebarAvatar = document.getElementById('sidebar-avatar');
          if (sidebarAvatar) {
            sidebarAvatar.src = dataUrl;
          }
          
          // 4. 更新报告弹窗头像
          const reportAvatar = document.getElementById('profile-report-avatar');
          if (reportAvatar) {
            reportAvatar.src = dataUrl;
          }
        };

        const showProfileInitials = (name) => {
          if (!name) return;
          const initials = name.length >= 2 ? name.slice(0, 2).toUpperCase() : name.charAt(0).toUpperCase();
          if (profileInitials) profileInitials.textContent = initials;
        };

        // 初始头像显示
        const hasAvatar = currentAccount && currentAccount.avatar && 
                          typeof currentAccount.avatar === 'string' && 
                          currentAccount.avatar.length > 0;
        if (hasAvatar) {
          window.setProfileAvatar(currentAccount.avatar);
        } else if (currentAccount && currentAccount.name) {
          showProfileInitials(currentAccount.name);
        }

        const triggerFileInput = () => profileFileInput.click();
        profileAvatarContainer.addEventListener('click', triggerFileInput);
        if (profileCameraBtn) profileCameraBtn.addEventListener('click', triggerFileInput);

        profileFileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            showToast('请上传 JPG/PNG/WebP 格式的图片', 'info');
            return;
          }
          if (file.size > 2 * 1024 * 1024) {
            showToast('图片大小不能超过 2MB', 'info');
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (window.AvatarCropper) {
              new window.AvatarCropper(ev.target.result, (cropped) => {
                window.setProfileAvatar(cropped);
                showToast('头像已更新', 'check');
              }).open();
            } else {
              window.setProfileAvatar(ev.target.result);
              showToast('头像已更新', 'check');
            }
          };
          reader.readAsDataURL(file);
        });
      }
      
      // 初始化兴趣标签选择器
      const interestTagSelector = document.getElementById('interest-tag-selector');
      if (interestTagSelector && window.TagSelector) {
        new window.TagSelector(interestTagSelector, {
          selectedTags: currentAccount ? (currentAccount.jobTags || []) : [],
          onChange: (tags) => {
            if (currentAccount) currentAccount.jobTags = tags;
          }
        });
      }
    }

    // ============ 注册页头像上传（圆形渐变+悬浮相机） ============
    let regAvatarDataUrl = '';
    let regAvatarSkipped = false;
    function initRegisterAvatar() {
      const circle = document.getElementById('reg-avatar-circle');
      const fileInput = document.getElementById('reg-avatar-file');
      const hintText = document.getElementById('reg-avatar-hint-text');
      const skipLink = document.getElementById('reg-avatar-skip');
      const imgEl = document.getElementById('reg-avatar-img');
      const placeholder = document.getElementById('reg-avatar-placeholder');
      if (!circle || !fileInput) {
        console.warn('[initRegisterAvatar] 元素缺失:', { circle: !!circle, fileInput: !!fileInput });
        return;
      }
      console.log('[initRegisterAvatar] 初始化完成');

      const setAvatar = (dataUrl) => {
        console.log('[setAvatar] 被调用, dataUrl 长度:', dataUrl?.length || 0);
        if (!dataUrl || dataUrl.length < 100) {
          console.error('[setAvatar] dataUrl 无效!');
          showToast('头像数据异常，请重新上传', 'error');
          return;
        }
        regAvatarDataUrl = dataUrl;
        window.__regAvatarDataUrl = dataUrl;
        regAvatarSkipped = false;
        circle.classList.add('has-avatar');
        imgEl.src = dataUrl;
        imgEl.style.display = 'block';
        placeholder.style.display = 'none';
        console.log('[setAvatar] 成功, 全局变量已设置, 长度:', dataUrl.length);
        showToast('头像上传成功', 'success');
      };

      const resetAvatar = () => {
        regAvatarDataUrl = '';
        window.__regAvatarDataUrl = '';
        circle.classList.remove('has-avatar');
        imgEl.src = '';
        imgEl.style.display = 'none';
        placeholder.style.display = 'flex';
      };

      circle.addEventListener('click', () => {
        console.log('[circle] 点击, 打开文件选择');
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        console.log('[fileInput] change 事件触发');
        const file = e.target.files[0];
        if (!file) {
          console.warn('[fileInput] 没有选择文件');
          return;
        }
        console.log('[fileInput] 选择的文件:', { name: file.name, type: file.type, size: file.size });
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          showToast('请上传 JPG/PNG/WebP 格式的图片', 'error');
          return;
        }
        if (file.size > 2 * 1024 * 1024) {
          showToast('图片大小不能超过 2MB', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          console.log('[reader] onload 触发, dataUrl 长度:', ev.target.result.length);
          console.log('[reader] AvatarCropper 是否可用:', !!window.AvatarCropper);
          
          // 关键修复：如果裁剪器不可用或出错，直接使用原图
          if (!window.AvatarCropper) {
            console.log('[reader] AvatarCropper 不可用，直接使用原图');
            setAvatar(ev.target.result);
            hintText.textContent = '已上传 · 点击重新上传';
            return;
          }
          
          try {
            let cropperCallbackFired = false;
            const cropper = new window.AvatarCropper(ev.target.result, (cropped) => {
              cropperCallbackFired = true;
              console.log('[cropper] 回调触发, cropped 长度:', cropped?.length || 0);
              if (cropped && cropped.length > 100) {
                setAvatar(cropped);
                hintText.textContent = '已上传 · 点击重新上传';
              } else {
                console.warn('[cropper] 裁剪结果无效，使用原图');
                setAvatar(ev.target.result);
                hintText.textContent = '已上传 · 点击重新上传';
              }
            });
            console.log('[cropper] 打开裁剪器');
            cropper.open();
            
            // 备用方案：3秒后如果回调没有触发，自动使用原图
            setTimeout(() => {
              if (!cropperCallbackFired) {
                console.warn('[cropper] 3秒内回调未触发，自动使用原图');
                setAvatar(ev.target.result);
                hintText.textContent = '已上传 · 点击重新上传';
                // 尝试关闭裁剪器
                try { cropper.close(); } catch(e) {}
                showToast('裁剪超时，已使用原图', 'info');
              }
            }, 3000);
          } catch (err) {
            console.error('[cropper] 出错，使用原图:', err.message);
            setAvatar(ev.target.result);
            hintText.textContent = '已上传 · 点击重新上传';
          }
        };
        reader.onerror = (err) => {
          console.error('[reader] onerror:', err);
          showToast('读取文件失败', 'error');
        };
        console.log('[reader] 开始读取文件');
        reader.readAsDataURL(file);
      });

      if (skipLink) {
        skipLink.addEventListener('click', (e) => {
          e.preventDefault();
          regAvatarSkipped = true;
          resetAvatar();
          hintText.textContent = '将使用昵称自动生成头像';
          
          // 自动获取昵称并生成首字母头像
          const nameInput = document.getElementById('reg-name');
          const name = (nameInput ? nameInput.value : '').trim() || '用户';
          const initials = name.length >= 2 ? name.slice(0, 2).toUpperCase() : name.charAt(0).toUpperCase();
          const colors = [
            ['#6D5EF6', '#0EA5B7'],
            ['#F59E0B', '#EF4444'],
            ['#10B981', '#0EA5B7'],
            ['#6D5EF6', '#EC4899'],
            ['#3B82F6', '#6D5EF6']
          ];
          const colorIdx = name.charCodeAt(0) % colors.length;
          const [c1, c2] = colors[colorIdx];
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
            <defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${c1}"/>
              <stop offset="100%" style="stop-color:${c2}"/>
            </linearGradient></defs>
            <rect width="120" height="120" rx="60" fill="url(#sg)"/>
            <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Sora, sans-serif" font-size="48" font-weight="700" fill="white">${initials}</text>
          </svg>`;
          const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
          regAvatarDataUrl = dataUrl;
          setAvatar(dataUrl);
          hintText.textContent = '已自动生成首字母头像 · 可重新上传';
        });
      }

      const generateBtn = document.getElementById('reg-avatar-generate');
      if (generateBtn) {
        generateBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const nameInput = document.getElementById('reg-name');
          const name = (nameInput ? nameInput.value : '').trim() || '用户';
          const initials = name.length >= 2 ? name.slice(0, 2).toUpperCase() : name.charAt(0).toUpperCase();
          const colors = [
            ['#6D5EF6', '#0EA5B7'],
            ['#F59E0B', '#EF4444'],
            ['#10B981', '#0EA5B7'],
            ['#6D5EF6', '#EC4899'],
            ['#3B82F6', '#6D5EF6']
          ];
          const colorIdx = name.charCodeAt(0) % colors.length;
          const [c1, c2] = colors[colorIdx];
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
            <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${c1}"/>
              <stop offset="100%" style="stop-color:${c2}"/>
            </linearGradient></defs>
            <rect width="120" height="120" rx="60" fill="url(#g)"/>
            <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Sora, sans-serif" font-size="48" font-weight="700" fill="white">${initials}</text>
          </svg>`;
          const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
          setAvatar(dataUrl);
          hintText.textContent = '已生成字母头像 · 可重新上传';
          showToast('已生成默认字母头像', 'check');
        });
      }
    }

    // ============ 注册表单实时校验 ============
    function initRegisterFormValidation() {
      const nameInput = document.getElementById('reg-name');
      const emailInput = document.getElementById('reg-email');
      const pwdInput = document.getElementById('reg-pwd');
      const pwdConfirm = document.getElementById('reg-pwd-confirm');
      const nicknameFb = document.getElementById('nickname-feedback');
      const emailFb = document.getElementById('email-feedback');
      const regBtn = document.querySelector('#form-register .btn-primary');

      if (!nameInput || !emailInput || !pwdInput) return;

      nameInput.addEventListener('input', () => {
        const res = window.FormValidator.validateNickname(nameInput.value);
        nicknameFb.style.display = 'block';
        nicknameFb.className = 'form-field form-feedback ' + (res.valid ? 'success' : 'error');
        nicknameFb.innerHTML = (res.valid ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-circle-exclamation"></i>') + res.message;
        updateRegisterBtnState();
      });

      emailInput.addEventListener('input', () => {
        const res = window.FormValidator.validateEmail(emailInput.value);
        emailFb.style.display = 'block';
        emailFb.className = 'form-field form-feedback ' + (res.valid ? 'success' : 'error');
        emailFb.innerHTML = (res.valid ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-circle-exclamation"></i>') + res.message;
        updateRegisterBtnState();
      });

      pwdInput.addEventListener('input', () => {
        updatePasswordStrength(pwdInput.value, 'reg-password-strength');
        if (pwdConfirm && pwdConfirm.value) checkPasswordMatch(pwdInput, pwdConfirm);
        updateRegisterBtnState();
      });

      if (pwdConfirm) {
        pwdConfirm.addEventListener('input', () => {
          checkPasswordMatch(pwdInput, pwdConfirm);
          updateRegisterBtnState();
        });
      }

      updateRegisterBtnState();
    }

    function updatePasswordStrength(pwd, containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const segments = container.querySelectorAll('.password-strength-segment');
      const label = container.querySelector('.password-strength-label');
      let score = 0;
      if (pwd && pwd.length >= 6) {
        const hasLetter = /[a-zA-Z]/.test(pwd);
        const hasNumber = /[0-9]/.test(pwd);
        const hasSpecial = /[^a-zA-Z0-9]/.test(pwd);
        const typeCount = [hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
        // 弱：仅字母或仅数字  /  中：字母+数字  /  强：字母+数字+特殊字符
        if (typeCount <= 1) score = 1;
        else if (typeCount === 2) score = 2;
        else score = 3;
      }
      const levels = ['weak', 'medium', 'strong'];
      const labels = ['弱', '中', '强'];
      segments.forEach((seg, i) => {
        seg.classList.remove('active', 'weak', 'medium', 'strong');
        if (i < score) seg.classList.add('active', levels[score - 1]);
      });
      label.className = 'password-strength-label' + (score > 0 ? ' ' + levels[score - 1] : '');
      label.textContent = score > 0 ? labels[score - 1] : '弱';
    }

    function checkPasswordMatch(pwdInput, confirmInput) {
      const matchEl = document.getElementById('reg-password-match');
      if (!matchEl) return;
      const pwd = pwdInput.value;
      const confirm = confirmInput.value;
      if (!confirm) {
        matchEl.textContent = '';
        matchEl.className = 'password-match';
        return;
      }
      if (pwd === confirm && pwd.length >= 6) {
        matchEl.textContent = '✓ 密码一致';
        matchEl.className = 'password-match matched';
      } else {
        matchEl.textContent = '✗ 密码不一致';
        matchEl.className = 'password-match mismatched';
      }
    }

    function validateFormField(field, val) {
      if (field === 'grade') updateRegisterBtnState();
    }

    function updateRegisterBtnState() {
      const name = document.getElementById('reg-name');
      const email = document.getElementById('reg-email');
      const pwd = document.getElementById('reg-pwd');
      const pwdConfirm = document.getElementById('reg-pwd-confirm');
      const grade = document.getElementById('reg-grade');
      const btn = document.querySelector('#form-register .btn-primary');
      if (!btn || !name || !email || !pwd || !grade) return;

      const nameValid = window.FormValidator.validateNickname(name.value).valid;
      const emailValid = window.FormValidator.validateEmail(email.value).valid;
      const pwdValid = pwd.value.length >= 6;
      const matchOk = !pwdConfirm || !pwdConfirm.value || pwd.value === pwdConfirm.value;
      const gradeOk = !!grade.value;
      const allOk = nameValid && emailValid && pwdValid && matchOk && gradeOk;

      btn.disabled = !allOk;
      btn.style.opacity = allOk ? '1' : '0.6';
      btn.style.cursor = allOk ? 'pointer' : 'not-allowed';
    }

    // ============ 登录页密码强度 ============
    function initLoginPasswordStrength() {
      const pwd = document.getElementById('login-pwd');
      if (!pwd) return;
      pwd.addEventListener('input', () => {
        updatePasswordStrength(pwd.value, 'login-password-strength');
      });
      updatePasswordStrength(pwd.value, 'login-password-strength');
    }

    // ============ 个人简介字数统计 ============
    function initBioCharCounter() {
      const bio = document.getElementById('form-bio');
      const counter = document.getElementById('bio-count');
      if (!bio || !counter) return;
      const update = () => {
        const len = bio.value.length;
        counter.textContent = `${len}/200`;
        counter.classList.remove('limit', 'exceed');
        if (len >= 180 && len < 200) counter.classList.add('limit');
        else if (len >= 200) counter.classList.add('exceed');
      };
      bio.addEventListener('input', update);
      update();
    }
