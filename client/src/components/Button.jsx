import { motion as Motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { micro } from '../lib/utils/animations.js';

const variants = {
  primary:
    'ui-button-primary',
  secondary:
    'ui-button-secondary',
  ghost:
    'ui-button-ghost',
  dark:
    'bg-surface-inverse text-background hover:bg-surface-inverse/90',
};

function Button({
  as: Component = 'button',
  children,
  className = '',
  disabled = false,
  isLoading = false,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}) {
  const typeProps = Component === 'button' ? { type } : {};
  const isNativeButton = Component === 'button';
  const MotionComponent = isNativeButton ? Motion.button : Motion.create(Component);
  const sizes = {
    sm: 'min-h-9 px-3 py-2 text-xs',
    md: 'min-h-11 px-4 py-2.5',
    lg: 'min-h-12 px-6 py-3 text-base',
  };

  return (
    <MotionComponent
      className={`ui-button ${sizes[size] || sizes.md} ${variants[variant]} ${className}`}
      disabled={isNativeButton ? disabled || isLoading : undefined}
      transition={micro.transition}
      whileHover={!disabled && !isLoading ? micro.hover : {}}
      whileTap={!disabled && !isLoading ? micro.tap : {}}
      {...typeProps}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span className="inline-flex items-center gap-2">{children}</span>
    </MotionComponent>
  );
}

export default Button;
