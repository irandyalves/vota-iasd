import React from 'react';

interface IasdLogoProps {
  className?: string;
  customUrl?: string;
}

export const IasdLogo: React.FC<IasdLogoProps> = ({ className = 'w-10 h-10', customUrl }) => {
  const imgSrc = customUrl || '/iasd-logo.png';

  return (
    <img
      src={imgSrc}
      alt="Logo Igreja Adventista do Sétimo Dia"
      className={`${className} object-contain rounded-xl shadow-md bg-white p-0.5 border border-amber-400/40`}
      onError={(e) => {
        // Fallback caso a imagem não carregue
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};
