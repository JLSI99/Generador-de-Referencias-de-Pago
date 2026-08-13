const express = require('express');
const path = require('path');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CONCEPTOS_AUTORIZADOS = {
  '1': { id: '01', nombre: 'Inscripción para Asistentes', monto: 250.00 },
  '2': { id: '02', nombre: 'Inscripción para Ponentes', monto: 450.00 },
  '3': { id: '03', nombre: 'Inscripción para Alumnos Asistentes del ITSC', monto: 500.00 }
};

// Datos bancarios institucionales estáticos
const DATOS_BANCARIOS = {
  banco: 'BBVA México, S.A.',
  convenioCIE: '1849201', // Número de Convenio CIE de prueba
  clabeInterbancaria: '012180001234567890',
  titular: 'UNIVERSIDAD CONGRESO TECNOLOGICO A.C.'
};

/**
 * Calcula el Dígito Verificador usando el algoritmo Módulo 10 de BBVA
 * Ponderación: [2, 1] de derecha a izquierda.
 * @param {string} base - Cadena de caracteres numéricos
 * @returns {string} Dígito verificador resultante (0-9)
 */
function calcularDigitoVerificadorModulo10(base) {
  if (!/^\d+$/.test(base)) {
    throw new TypeError('La base para la referencia debe ser estrictamente numérica.');
  }

  const factors = [2, 1];
  let sum = 0;
  let factorIdx = 0;

  for (let i = base.length - 1; i >= 0; i--) {
    const digit = parseInt(base.charAt(i), 10);
    const factor = factors[factorIdx % 2];
    let product = digit * factor;

    if (product >= 10) {
      product = Math.floor(product / 10) + (product % 10);
    }

    sum += product;
    factorIdx++;
  }

  const remainder = sum % 10;
  return ((10 - remainder) % 10).toString();
}

/**
 * Genera la referencia bancaria estructurada
 * Format: [Matrícula 8 Dig][ID Concepto 2 Dig][DV 1 Dig]
 * @param {string} matricula 
 * @param {string} conceptoId 
 * @returns {string} Referencia de 11 dígitos
 */
function generarReferenciaBBVA(matricula, conceptoId) {
  const matriculaLimpia = matricula.replace(/\D/g, '').padStart(8, '0').slice(-8);
  const baseCadena = `${matriculaLimpia}${conceptoId.padStart(2, '0')}`;
  const dv = calcularDigitoVerificadorModulo10(baseCadena);
  return `${baseCadena}${dv}`;
}

/**
 * Endpoint de Generación de Ficha PDF
 */
app.post('/api/v1/ficha', (req, res) => {
  try {
    const { nombre, matricula, concepto_id } = req.body;

    // Validaciones de Entrada
    if (!nombre || !matricula || !concepto_id) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos: nombre, matricula, concepto_id' });
    }

    const conceptoSel = CONCEPTOS_AUTORIZADOS[concepto_id];
    if (!conceptoSel) {
      return res.status(400).json({ error: 'El concepto seleccionado no es válido.' });
    }

    // Cálculo de la referencia
    const referenciaGenerada = generarReferenciaBBVA(matricula, conceptoSel.id);

    // Configuración de encabezados HTTP para la descarga streaming del PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Ficha_Pago_${matricula}.pdf`);

    // Creación del documento PDF
    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    doc.pipe(res);

    // --- ENCABEZADO ---
    doc.rect(40, 40, 532, 60).fill('#004481'); // Azul Corporativo BBVA
    doc.fillColor('#FFFFFF')
       .fontSize(16)
       .text('FICHA DE PAGO BANCARIO - CONGRESO UNIVERSITARIO', 50, 52, { width: 512, align: 'center' });
    doc.fontSize(10)
       .text('SISTEMA DE RECAUDACIÓN Y MATRÍCULA', 50, 75, { width: 512, align: 'center' });

    doc.moveDown(3);

    // --- DATOS DEL ALUMNO ---
    const startYAlumno = 120;
    doc.fillColor('#333333').fontSize(12).text('DATOS DEL REGISTRANTE', 40, startYAlumno, { underline: true });
    
    doc.fontSize(10)
       .text(`Nombre Completo: ${nombre.toUpperCase()}`, 40, startYAlumno + 20)
       .text(`Matrícula / ID: ${matricula.toUpperCase()}`, 40, startYAlumno + 35)
       .text(`Concepto: ${conceptoSel.nombre}`, 40, startYAlumno + 50)
       .text(`Monto a Pagar: $${conceptoSel.monto.toFixed(2)} MXN`, 40, startYAlumno + 65);

    // --- INSTRUCCIONES DE PAGO BBVA ---
    const startYBBVA = 220;
    doc.rect(40, startYBBVA, 532, 140).fillAndStroke('#F4F6F8', '#DCDCDC');

    doc.fillColor('#004481').fontSize(11).text('OPCIÓN 1: PAGO EN VENTANILLA / APP BBVA (CIE)', 55, startYBBVA + 15);
    
    doc.fillColor('#333333').fontSize(10)
       .text(`Institución Bancaria:`, 55, startYBBVA + 35)
       .font('Helvetica-Bold').text(DATOS_BANCARIOS.banco, 180, startYBBVA + 35).font('Helvetica')
       .text(`Número de Convenio CIE:`, 55, startYBBVA + 50)
       .font('Helvetica-Bold').text(DATOS_BANCARIOS.convenioCIE, 180, startYBBVA + 50).font('Helvetica')
       .text(`Referencia de Pago:`, 55, startYBBVA + 65)
       .font('Helvetica-Bold').fontSize(12).fillColor('#D32F2F')
       .text(referenciaGenerada, 180, startYBBVA + 63)
       .fontSize(10).fillColor('#333333').font('Helvetica')
       .text(`Importe Exacto:`, 55, startYBBVA + 85)
       .font('Helvetica-Bold').text(`$${conceptoSel.monto.toFixed(2)} MXN`, 180, startYBBVA + 85);

    // --- OPCIÓN SPEI ---
    const startYSPEI = 380;
    doc.rect(40, startYSPEI, 532, 110).fillAndStroke('#FFFFFF', '#DCDCDC');

    doc.fillColor('#004481').fontSize(11).text('OPCIÓN 2: TRANSFERENCIA INTERBANCARIA (SPEI)', 55, startYSPEI + 15);
    
    doc.fillColor('#333333').fontSize(10)
       .text(`Beneficiario:`, 55, startYSPEI + 35)
       .font('Helvetica-Bold').text(DATOS_BANCARIOS.titular, 180, startYSPEI + 35).font('Helvetica')
       .text(`CLABE Interbancaria:`, 55, startYSPEI + 50)
       .font('Helvetica-Bold').text(DATOS_BANCARIOS.clabeInterbancaria, 180, startYSPEI + 50).font('Helvetica')
       .text(`Concepto / Referencia SPEI:`, 55, startYSPEI + 65)
       .font('Helvetica-Bold').fillColor('#D32F2F').text(referenciaGenerada, 180, startYSPEI + 65);

    // --- PIE DE PÁGINA / AVISOS ---
    doc.fillColor('#666666').fontSize(8)
       .text('* Esta ficha de pago tiene una vigencia de 5 días hábiles a partir de su emisión.', 40, 520)
       .text('* Es indispensable utilizar la referencia exacta mostrada en este documento para la conciliación automática de su pago.', 40, 532);

    doc.end();

  } catch (error) {
    console.error('Error al generar la ficha:', error);
    res.status(500).json({ error: 'Error interno al procesar la ficha de pago.' });
  }
});

// Inicialización del Servidor
app.listen(PORT, () => {
  console.log(`[INFO] Servidor corriendo en http://localhost:${PORT}`);
});