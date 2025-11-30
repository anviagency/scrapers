/**
 * HTML fixtures for testing
 */

export function loadHTMLFixture(name: string): string {
  // In a real scenario, these would be loaded from files
  // For now, we'll return sample HTML based on the fixture name

  if (name === 'job-listing-complete.html') {
    return `
      <div class="job-listing">
        <h2><a href="/Search/UploadSingle.aspx?JobID=8391177">דרוש /ה עו"ד בתחום המיסוי המוניציפאלי</a></h2>
        <div class="company">
          <a href="/Employer/HP/Default.aspx?cid=12345">חברה חסויה</a>
        </div>
        <div class="description">
          <p>מיקום המשרה: תל אביב</p>
          <p>סוג משרה: משרה מלאה</p>
          <p>משרדנו מתמחה במשפט מנהלי, רשויות מקומיות ומיסוי מוניציפאלי, ומחפש עו"ד עם ניסיון של 02 שנים.</p>
          <p>דרישות: ניסיון של 02 שנים. עדיפות תינתן לבעלי ניסיון ממשרדים העוסקים בארנונה.</p>
        </div>
        <div class="job-id">8391177</div>
      </div>
    `;
  }

  if (name === 'search-results-page.html') {
    return `
      <div class="search-results">
        <div class="job-listing">
          <h2><a href="/Search/UploadSingle.aspx?JobID=8391177">Job 1</a></h2>
          <div class="company"><a href="/Employer/HP/Default.aspx?cid=1">Company 1</a></div>
          <p>סוג משרה: משרה מלאה</p>
          <p>מיקום: תל אביב</p>
        </div>
        <div class="job-listing">
          <h2><a href="/Search/UploadSingle.aspx?JobID=8420768">Job 2</a></h2>
          <div class="company"><a href="/Employer/HP/Default.aspx?cid=2">Company 2</a></div>
          <p>סוג משרה: משרה חלקית</p>
          <p>מיקום: בני ברק</p>
        </div>
        <div class="job-listing">
          <h2><a href="/Search/UploadSingle.aspx?JobID=8424679">Job 3</a></h2>
          <div class="company"><a href="/Employer/HP/Default.aspx?cid=3">Company 3</a></div>
          <p>סוג משרה: משרה מלאה</p>
          <p>מיקום: ירושלים</p>
        </div>
      </div>
    `;
  }

  if (name === 'search-results-with-pagination.html') {
    return `
      <div class="search-results">
        <div class="job-listing">Job 1</div>
      </div>
      <div class="pagination">
        <a href="/SearchResultsGuest.aspx?page=1">1</a>
        <a href="/SearchResultsGuest.aspx?page=2">2</a>
        <a href="/SearchResultsGuest.aspx?page=2">דף הבא</a>
      </div>
    `;
  }

  return '';
}
