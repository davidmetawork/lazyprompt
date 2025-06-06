import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
export const createAuthOptions = () => ({
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        }),
        GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID || '',
            clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        }),
    ],
    pages: {
        signIn: '/auth/signin',
        error: '/auth/error',
    },
    callbacks: {
        session: ({ session, token }) => {
            if (session.user && token.sub) {
                session.user.id = token.sub;
            }
            return session;
        },
        jwt: ({ token, user }) => {
            if (user) {
                token.sub = user.id;
            }
            return token;
        },
    },
    session: {
        strategy: 'jwt',
    },
    secret: process.env.NEXTAUTH_SECRET,
});
