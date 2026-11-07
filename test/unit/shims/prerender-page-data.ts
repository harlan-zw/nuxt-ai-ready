export async function readPageDataFromFilesystem() {
  return {
    pages: ['/about', '/retired'].map(route => ({
      route,
      title: route === '/about' ? 'About page' : 'Retired page',
      description: 'The about page description.',
      markdown: '# Page',
      headings: [],
      keywords: [],
      updatedAt: '',
      locale: 'en',
    })),
    errorRoutes: ['/broken'],
  }
}

export async function readMarkdownLinkAvailabilityFromFilesystem() {
  return { runtimeMarkdownAvailable: false, paths: ['/about.md', '/retired.md'] }
}
