"""Convert the two yearly Excel files to long-format rows (data/seed.json + seed.xlsx for Google Sheets import)."""
import sys, json, re, openpyxl
TH = {'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12,'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,'กรกฏาคม':7,'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9}
def num(v):
    if v is None: return None, ''
    if isinstance(v,(int,float)): return round(float(v),2), ''
    s=str(v).strip()
    m=re.fullmatch(r'(\d+)\.\.(\d+)', s)          # typo like 6..64 -> 6.64
    if m: return float(f'{m[1]}.{m[2]}'), 'แก้ไขจากต้นฉบับ: '+s
    try: return round(float(s),2), ''
    except ValueError: return None, s              # e.g. "ปิดปรับปรุงหอผู้ป่วย"
def read(path):
    ws=openpyxl.load_workbook(path,data_only=True).active
    fy=int(re.search(r'(\d{4})\s*$', ws['D1'].value).group(1))
    months=[]
    for c in range(4,28,2):
        name,yy=ws.cell(3,c).value.split()
        mo=TH[name]; year=2500+int(yy)-543
        months.append(f'{year}-{mo:02d}')
    wards,rows=[],[]
    for r in range(5,ws.max_row+1):
        if ws.cell(r,2).value is None: continue
        no,ward,dev=ws.cell(r,1).value,ws.cell(r,2).value.strip(),ws.cell(r,3).value.strip()
        wards.append(dict(no=no,ward=ward,device=dev,active=True))
        for i,m in enumerate(months):
            l1,n1=num(ws.cell(r,4+2*i).value); l2,n2=num(ws.cell(r,5+2*i).value)
            note='; '.join(sorted({x for x in (n1,n2) if x}))
            rows.append(dict(fy=fy,month=m,ward=ward,device=dev,l1=l1,l2=l2,note=note))
    return wards,rows
if __name__=='__main__':
    allw,allr=[],[]
    for p in sys.argv[2:]:
        w,r=read(p); allr+=r
        if not allw: allw=w
    json.dump(dict(wards=allw,rows=allr),open(sys.argv[1]+'/seed.json','w'),ensure_ascii=False)
    wb=openpyxl.Workbook(); d=wb.active; d.title='Data'
    d.append(['fiscal_year','month','ward','device','L1','L2','note','updated_at'])
    for r in allr: d.append([r['fy'],r['month'],r['ward'],r['device'],r['l1'],r['l2'],r['note'],''])
    for row in d.iter_rows(min_row=2,min_col=2,max_col=2):
        for c in row: c.number_format='@'
    w=wb.create_sheet('Wards'); w.append(['no','ward','device','active'])
    for x in allw: w.append([x['no'],x['ward'],x['device'],'TRUE'])
    s=wb.create_sheet('Config'); s.append(['key','value']); s.append(['cv_threshold',6.7])
    wb.save(sys.argv[1]+'/seed.xlsx')
    print(len(allw),'wards',len(allr),'rows')
