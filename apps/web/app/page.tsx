import HomeClient from './home-client';

// Always serve a fresh application shell after deployments so browsers do not
// keep an HTML document referencing chunks removed by a newer build.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <HomeClient />;
}
