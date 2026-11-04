import { register } from '../../registry.js'
import ReviewQueue from './ReviewQueue.vue'

/** Understanding: the review queue and delegated confirmation (MindLink#25). */
register({
  id: 'understanding',
  nav: [{ label: '审阅', path: '/review' }],
  routes: [
    { path: '/review', title: '审阅', component: ReviewQueue },
    {
      path: '/review/delegation',
      title: '托管确认',
      component: () => import('./DelegationPage.vue'),
    },
  ],
})
