import LoginForm from '../components/Auth/LoginForm';

export default function LoginPage({ setIsLoggedIn }: any) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <LoginForm setIsLoggedIn={setIsLoggedIn} />
    </div>
  );
}
