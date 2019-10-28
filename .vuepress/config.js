  module.exports = ({
    title: 'Psicmi',
    description: '拥抱开源吧，这个世界，很有趣！',
    themeConfig: {
      nav: [
        { text: '主页', link: '/' },
        {
            text: '开源项目',
            ariaLabel: '开源项目',
            items: [
            { text: '账户服务平台', link: '/project/vasp/' },
            { text: '账户服务对接工具', link: '/project/vasp-sdk/' }
            ]
        },
        { text: '关于本站', link: '/about/' , target:'_blank'}
      ],
      sidebar: {
        '/project/vasp/': [   
            '',
            'term',
            'basic-service',
            'business-example'
        ],
  
        '/project/vasp-sdk/': [
          ''
        ],
  
        '/about/': [
          ''
        ]
      }
    },

    //显示所有标题
    displayAllHeaders: true,

    //基于git提交的最近提交日期
    lastUpdated: '上次更新',

    //页面滚动
    smoothScroll: true
  })