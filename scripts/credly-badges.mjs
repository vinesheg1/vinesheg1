import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const README_PATH = path.resolve(process.cwd(), 'README.md');
const PERSONAL_USER = 'vinesh-eg'
const ORG_USER = 'vinesh-eg.09e7ae76'


function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeBadgeLabel(value) {
  return encodeURIComponent(value).replace(/%20/g, '%20');
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractSkillsFromSource(source, skills = []) {
  if (Array.isArray(source)) {
    for (const item of source) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) skills.push(trimmed);
      } else if (item && typeof item === 'object') {
        const name = item.name || item.display_name || item.skill_name || item.title;
        if (name) skills.push(String(name));
      }
    }
  } else if (source && typeof source === 'object') {
    const name = source.name || source.display_name || source.skill_name || source.title;
    if (name) skills.push(String(name));
  } else if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed) skills.push(trimmed);
  }

  return skills;
}

function extractSkills(badge) {
  const badgeTemplate = badge?.badge_template || {};
  const rawSkills = [
    badge?.skills,
    badgeTemplate?.skills,
    badge?.skill_names,
    badgeTemplate?.skill_names,
  ];

  const skills = [];
  for (const source of rawSkills) {
    extractSkillsFromSource(source, skills);
  }

  const seen = new Set();
  return skills.filter((skill) => {
    const normalized = skill.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

async function getBadgesData(username) {
  if (!username) return [];

  const url = `https://credly.com/users/${username}/badges.json`;
  const payload = await fetchJson(url);
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data.map((badge) => {
    const badgeTemplate = badge?.badge_template || {};
    const badgeName = badgeTemplate?.name || 'Badge';
    const imageUrl = badgeTemplate?.image_url || '';
    const badgeId = badge?.id || badgeTemplate?.id || '';
    const verificationUrl = badgeId ? `https://credly.com${badgeId.startsWith('/') ? badgeId : `/${badgeId}`}` : '#';

    return {
      name: badgeName,
      imageUrl,
      verificationUrl,
      skills: extractSkills(badge),
    };
  });
}

async function isImageAvailable(imageUrl) {
  if (!imageUrl) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(imageUrl, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function renderBadgesHtml(badges) {
  if (!badges.length) {
    return '<div align="left"><!-- No badges found --></div>';
  }

  const colors = ['16a34a', '2563eb', '9333ea', 'dc2626', 'd97706', '0f766e', '7c3aed', '0891b2', 'ea580c', 'be185d'];
  let htmlOutput = '';

  for (const [index, badge] of badges.entries()) {
    const safeName = escapeHtml(badge.name);
    const imageUrl = badge.imageUrl;
    const verificationUrl = escapeHtml(badge.verificationUrl);

    if (imageUrl && await isImageAvailable(imageUrl)) {
      htmlOutput += `  <a href="${verificationUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin:5px;"><img src="${escapeHtml(imageUrl)}" width="70" height="70" alt="${safeName}" title="${safeName}"/></a>\n`;
    } else {
      const normalizedName = badge.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'badge';
      const color = colors[index % colors.length];
      const badgeUrl = `https://img.shields.io/badge/${encodeBadgeLabel(normalizedName)}-${color}`;
      htmlOutput += `  <a href="${verificationUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin:5px;"><img src="${badgeUrl}" width="70" height="70" alt="${safeName}" title="${safeName}"/></a>\n`;
    }
  }

  return htmlOutput;
}

function renderSkillsHtml(badges) {
  const allSkills = badges.flatMap((badge) => badge.skills);
  const seen = new Set();
  const uniqueSkills = allSkills.filter((skill) => {
    const normalized = skill.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });

  if (!uniqueSkills.length) {
    return '';
  }

  const colors = ['16a34a', '2563eb', '9333ea', 'dc2626', 'd97706', '0f766e', '7c3aed', '0891b2', 'ea580c', 'be185d'];
  const skillHtml = uniqueSkills.map((skill, index) => {
    const color = colors[index % colors.length];
    const encodedSkill = encodeURIComponent(skill);
    const badgeUrl = `https://img.shields.io/badge/${encodedSkill}-${color}`;
    return `  <img src="${badgeUrl}" alt="${escapeHtml(skill)}" title="${escapeHtml(skill)}" style="margin:5px;"/>`;
  }).join('\n');

  return '<div align="left">\n' + skillHtml + '\n</div>';
}

function injectSection(readme, sectionName, content) {
  const startTag = `<!-- START_SECTION:${sectionName} -->`;
  const endTag = `<!-- END_SECTION:${sectionName} -->`;
  const pattern = new RegExp(`(${escapeRegExp(startTag)})([\\s\\S]*?)(${escapeRegExp(endTag)})`);
  if (!pattern.test(readme)) {
    return readme;
  }

  return readme.replace(pattern, `$1\n${content}\n$3`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const personalBadges = await getBadgesData(PERSONAL_USER);
  const orgBadges = await getBadgesData(ORG_USER);
  const allBadges = [...personalBadges, ...orgBadges];

  const personalBadgesHtml = await renderBadgesHtml(allBadges);
  const skillsHtml = renderSkillsHtml(allBadges);
  const customBadges = '<a href="https://www.apollographql.com/tutorials/certifications/0a3e6b69-0ab8-4a4a-ba28-2b15914b40ff" target="_blank"><img src="https://res.cloudinary.com/apollographql/image/upload/v1632844693/badge_sfsiin.svg" width="70" height="70" alt="Graph Developer - Associate" title="Graph Developer - Associate" style="margin: 5px;"/></a><a href="https://cc.sj-cdn.net/certificate/3n2veylcj0hl/certificate-9pq37dfzvoy4-1773069942.jpg?Expires=1782236312&Signature=Qqu9FA5FlTPBVGAqcUuVBgxN0GZ~G-n8ELHKf9bkCa7ovAR91hbUaAdB6F4i59fONcan38xFMOvG3br0XLLPIjO7iYrNIxGMp8KNKmkvobB40JtANKmu9YtHNKq29JJYYJUKXhdnHMMikQAbKTk56uS0D~Dff4bj-ZScCz2zHhFqRgVuY2avtX96JbPg942yAo5O07RXynyPw0uxpOaH5PjySAxQgJITGxCURgxE94TCWJAsWEKo6QvqKfIsCctvxSvDdQZr79v4Ck2ocqug3PPTno0ZMuxaDf0u7UOvOTzZpgzZ0ESOBerWkamiOzeuTiUrY0N04RBdRRauhlZTMQ__&Key-Pair-Id=APKAI3B7HFD2VYJQK4MQ" target="_blank"><img src="https://cc.sj-cdn.net/certificate/3n2veylcj0hl/certificate-9pq37dfzvoy4-1773069942.jpg?Expires=1782236312&Signature=Qqu9FA5FlTPBVGAqcUuVBgxN0GZ~G-n8ELHKf9bkCa7ovAR91hbUaAdB6F4i59fONcan38xFMOvG3br0XLLPIjO7iYrNIxGMp8KNKmkvobB40JtANKmu9YtHNKq29JJYYJUKXhdnHMMikQAbKTk56uS0D~Dff4bj-ZScCz2zHhFqRgVuY2avtX96JbPg942yAo5O07RXynyPw0uxpOaH5PjySAxQgJITGxCURgxE94TCWJAsWEKo6QvqKfIsCctvxSvDdQZr79v4Ck2ocqug3PPTno0ZMuxaDf0u7UOvOTzZpgzZ0ESOBerWkamiOzeuTiUrY0N04RBdRRauhlZTMQ__&Key-Pair-Id=APKAI3B7HFD2VYJQK4MQ" width="70" height="70" alt="Claude Code in Action" title="Claude Code in Action" style="margin: 5px;"/></a>';

  const updatedReadme = injectSection(readme, 'credly-personal', personalBadgesHtml + customBadges);
  const finalReadme = injectSection(updatedReadme, 'credly-skills', skillsHtml);
  fs.writeFileSync(README_PATH, finalReadme, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
