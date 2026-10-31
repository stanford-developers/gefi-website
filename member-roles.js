/* Membership roles are editorial data, never inferred from outside appointments. */
(() => {
  function tags(member) {
    if (!member.roles) return [{label:member.tag || 'Member',kind:'founder'}];
    const roles = member.roles;
    const result = [];
    if (roles.foundingMember) result.push({label:'Founding member',kind:'founder'});
    if (roles.steeringCommittee === true) result.push({label:'Steering committee',kind:'steering'});
    for (const group of roles.workingGroups || []) {
      if (!group) continue;
      if (typeof group === 'object' && group.active === false) continue;
      const name = (typeof group === 'string' ? group : group.name || '').trim();
      if (name) result.push({label:/working group$/i.test(name) ? name : `${name} working group`,kind:'working-group'});
    }
    return result.filter((tag,index) => result.findIndex(other => other.label === tag.label) === index);
  }
  function render(member) {
    const container = document.createElement('div');
    container.className = 'member-tags';
    container.setAttribute('aria-label','GEFI roles');
    for (const tag of tags(member)) {
      const badge = document.createElement('span');
      badge.className = tag.kind === 'founder' ? 'founder-tag' : `role-tag role-tag--${tag.kind}`;
      badge.textContent = tag.label; container.append(badge);
    }
    return container;
  }
  window.GEFIMemberRoles = {tags,render};
  const source = document.querySelector('#member-role-data');
  if (!source) return;
  for (const member of JSON.parse(source.textContent)) {
    const profile = document.getElementById(member.id);
    const heading = profile?.querySelector('summary h2');
    if (!heading) continue;
    const identity = document.createElement('div'); identity.className = 'profile-identity';
    heading.replaceWith(identity); identity.append(heading,render(member));
  }
})();
