export default function Avatar({ member, size = 26 }) {
  const style = { width: size, height: size, '--c': member.color };
  if (member.avatar) return <img className="avatar" src={member.avatar} alt="" style={style} />;
  return (
    <span className="avatar avatar-letter" style={style} aria-hidden="true">
      {member.pseudo.slice(0, 1).toUpperCase()}
    </span>
  );
}
