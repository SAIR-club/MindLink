import { register } from '../../registry.js'
import './project.css'
import ProjectList from './ProjectList.vue'

/** Learning projects (MindLink#10): the list, a new project, and one project's settings. */

register({
  id: 'project',
  nav: [{ label: '学习项目', path: '/projects' }],
  routes: [
    { path: '/projects', title: '学习项目', component: ProjectList },
    { path: '/projects/new', title: '新建学习项目', component: () => import('./ProjectNew.vue') },
    {
      path: '/projects/:id',
      title: '项目设置',
      component: () => import('./ProjectSettings.vue'),
    },
  ],
})
