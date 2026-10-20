import React from 'react';

interface IasdLogoProps {
  className?: string;
  customUrl?: string;
}

export const IasdLogo: React.FC<IasdLogoProps> = ({ className = 'w-10 h-10', customUrl }) => {
  if (customUrl) {
    return (
      <img
        src={customUrl}
        alt="Logo IASD"
        className={`${className} object-contain rounded-xl shadow-md`}
      />
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Fundo arredondado estilizado */}
      <rect width="100" height="100" rx="22" fill="#002F6C" />
      <rect width="100" height="100" rx="22" stroke="#D4AF37" strokeWidth="2" strokeOpacity="0.6" />

      {/* Chamas do Espírito Santo / 3 Anjos (Estilo Oficial IASD) */}
      {/* Chama Esquerda */}
      <path
        d="M28 65C28 45 38 32 46 22C44 32 40 40 42 48C43 42 46 36 50 30C50 42 46 52 48 65C40 65 34 65 28 65Z"
        fill="#D4AF37"
      />
      {/* Chama Central com a Cruz */}
      <path
        d="M48 16C51 24 53 32 53 42C56 36 60 30 65 24C62 34 58 44 58 55C66 45 74 36 78 26C78 40 70 54 62 65L38 65C42 54 46 38 48 16Z"
        fill="#F6E05E"
        fillOpacity="0.9"
      />

      {/* A Cruz Central */}
      <rect x="48.5" y="24" width="3.5" height="42" fill="#001F47" />
      <rect x="42" y="34" width="16.5" height="3.5" fill="#001F47" />

      {/* A Bíblia Aberta na Base */}
      <path
        d="M22 69C35 66 48 68 50 73C52 68 65 66 78 69C76 74 65 72 50 76C35 72 24 74 22 69Z"
        fill="#D4AF37"
      />
      <path
        d="M23 72C35 69 48 71 50 76C52 71 65 69 77 72C75 77 65 75 50 79C35 75 25 77 23 72Z"
        fill="#FFFFFF"
        fillOpacity="0.85"
      />
    </svg>
  );
};
