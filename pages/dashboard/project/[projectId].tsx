import { GetServerSideProps } from 'next'

export default function ProjectRedirect() {
  // This component should never be rendered due to the redirect
  return null
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { projectId } = context.params!
  
  return {
    redirect: {
      destination: `/dashboard/project/${projectId}/comments`,
      permanent: false, // Use 302 redirect since this is a convenience redirect
    },
  }
}
