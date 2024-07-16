package main

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/adrg/frontmatter"
	"github.com/golang/freetype"
	"github.com/golang/freetype/truetype"
	"github.com/nfnt/resize"
	"golang.org/x/image/font"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatalf("usage: %s <blog post file path>", os.Args[0])
	}

	width := 876
	height := 438

	logo := image.NewRGBA(image.Rect(0, 0, width, height))

	blogPostFileName := os.Args[1]
	blogInfo, err := getBlogInfo(blogPostFileName)
	if err != nil {
		log.Fatalf("unable to get blog info: %v", err)
	}

	// read font file
	fontBytes, err := os.ReadFile("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")
	if err != nil {
		log.Fatalf("unable to open font file: %w", err)
	}

	// parse parsedFont file
	parsedFont, err := freetype.ParseFont(fontBytes)
	if err != nil {
		log.Fatalf("unable to parse font file: %w", err)
	}

	drawBackground(logo)
	drawBorder(logo)
	err = addProfilePicture(logo)
	if err != nil {
		log.Fatalf("unable to add profile picture: %v", err)
	}
	err = writeHashtags(logo, parsedFont, blogInfo.Tags)
	if err != nil {
		log.Fatalf("unable to write hashtags: %v", err)
	}
	err = writeTitle(logo, parsedFont, blogInfo.Title)
	if err != nil {
		log.Fatalf("unable to write title: %v", err)
	}
	err = writeWebsiteName(logo, parsedFont)
	if err != nil {
		log.Fatalf("unable to write website name: %v", err)
	}

	// create image directory
	err = os.MkdirAll("static/images/logos", 0755)
	if err != nil {
		log.Fatalf("unable to create logo directory: %v", err)
	}

	// create PNG file
	blogBaseFileName := filepath.Base(blogPostFileName)
	blogName := strings.TrimSuffix(blogBaseFileName, filepath.Ext(blogBaseFileName))
	imageFile, err := os.Create(fmt.Sprintf("static/images/logos/%s.png", blogName))
	if err != nil {
		log.Fatalf("unable to create image file for %s: %v", err, blogName)
	}

	err = png.Encode(imageFile, logo)
	if err != nil {
		log.Fatalf("unable to encode image: %v", err)
	}
}

type blogInfo struct {
	Title string
	Tags  []string
}

func getBlogInfo(blogPostFileName string) (blogInfo, error) {
	info := blogInfo{}

	blogFile, err := os.Open(blogPostFileName)
	if err != nil {
		return info, fmt.Errorf("unable to open file: %w", err)
	}
	defer blogFile.Close()

	_, err = frontmatter.Parse(blogFile, &info)
	if err != nil {
		return info, fmt.Errorf("unable to parse frontmatter: %w", err)
	}

	return info, nil
}

func drawBackground(logo *image.RGBA) {
	backgroundColor := image.NewUniform(color.RGBA{33, 33, 33, 255})

	draw.Draw(logo, logo.Bounds(), backgroundColor, image.ZP, draw.Src)
}

func addProfilePicture(logo *image.RGBA) error {
	profilePicture, err := os.Open("static/images/profile.png")
	if err != nil {
		return fmt.Errorf("unable to open profile picture: %w", err)
	}
	defer profilePicture.Close()

	profilePictureImage, _, err := image.Decode(profilePicture)
	if err != nil {
		return fmt.Errorf("unable to decode profile picture: %w", err)
	}

	resizedImage := resize.Resize(100, 0, profilePictureImage, resize.Lanczos3)

	startingX := logo.Bounds().Dx() - 150
	endingX := startingX + resizedImage.Bounds().Dx()
	startingY := logo.Bounds().Dy() - 165
	endingY := startingY + resizedImage.Bounds().Dy()
	imageBounds := image.Rect(startingX, startingY, endingX, endingY)
	draw.Draw(logo, imageBounds.Bounds(), resizedImage, image.ZP, draw.Over)

	return nil
}

func drawBorder(logo *image.RGBA) {
	borderColor := color.RGBA{239, 239, 239, 255}
	borderThickness := 10

	// TODO refactor to use draw.Draw

	// draw left border
	for x := 0; x < borderThickness; x++ {
		for y := 0; y < logo.Bounds().Dy(); y++ {
			logo.Set(x, y, borderColor)
		}
	}

	// draw right border
	for x := logo.Bounds().Dx() - borderThickness; x < logo.Bounds().Dx(); x++ {
		for y := 0; y < logo.Bounds().Dy(); y++ {
			logo.Set(x, y, borderColor)
		}
	}

	// draw top border
	for x := 0; x < logo.Bounds().Dx(); x++ {
		for y := 0; y < borderThickness; y++ {
			logo.Set(x, y, borderColor)
		}
	}

	// draw bottom border
	for x := 0; x < logo.Bounds().Dx(); x++ {
		for y := logo.Bounds().Dy() - borderThickness; y < logo.Bounds().Dy(); y++ {
			logo.Set(x, y, borderColor)
		}
	}
}

func writeHashtags(logo *image.RGBA, parsedFont *truetype.Font, hashtags []string) error {
	fontColor := color.RGBA{239, 239, 239, 255}
	fontSize := float64(18)
	hashtagSpacing := 10

	freeTypeContext := getFreeTypeContext(logo, parsedFont, fontSize, fontColor)

	pt := freetype.Pt(30, 404)
	for _, hashtag := range hashtags {
		lastPt, err := freeTypeContext.DrawString("#"+hashtag, pt)
		if err != nil {
			return fmt.Errorf("unable to draw text: %w", err)
		}
		pt.X = freeTypeContext.PointToFixed(float64(lastPt.X.Round() + hashtagSpacing))
	}

	return nil
}

func writeTitle(logo *image.RGBA, parsedFont *truetype.Font, title string) error {
	fontColor := color.RGBA{239, 239, 239, 255}
	fontSize := float64(48)

	freeTypeContext := getFreeTypeContext(logo, parsedFont, fontSize, fontColor)

	face := truetype.NewFace(parsedFont, &truetype.Options{
		Size: fontSize,
	})
	textHeight := face.Metrics().Ascent.Ceil() + face.Metrics().Descent.Ceil()
	var rowWidths []int
	lineWidth := 0

	for _, str := range strings.Split(title, " ") {
		strWidth := font.MeasureString(face, str).Ceil()
		if lineWidth+strWidth+15 < logo.Bounds().Dx() {
			lineWidth += strWidth + 15
		} else {
			rowWidths = append(rowWidths, lineWidth-15)
			lineWidth = strWidth
		}
	}
	rowWidths = append(rowWidths, lineWidth)

	lineWidth = 0
	numRows := 0
	totalRows := len(rowWidths)
	for _, str := range strings.Split(title, " ") {
		strWidth := font.MeasureString(face, str).Ceil()
		if lineWidth+strWidth+15 < logo.Bounds().Dx() {
			x := (logo.Bounds().Dx()-rowWidths[numRows])/2 + lineWidth
			pt := freetype.Pt(x, (logo.Bounds().Dy()-(totalRows*textHeight))/2+(numRows*textHeight))
			lineWidth += strWidth + 15
			_, err := freeTypeContext.DrawString(str, pt)
			if err != nil {
				return fmt.Errorf("unable to draw text: %w", err)
			}
		} else {
			lineWidth = 0
			numRows += 1
			x := (logo.Bounds().Dx()-rowWidths[numRows])/2 + lineWidth
			pt := freetype.Pt(x, (logo.Bounds().Dy()-(totalRows*textHeight))/2+(numRows*textHeight))
			lineWidth += strWidth + 15
			_, err := freeTypeContext.DrawString(str, pt)
			if err != nil {
				return fmt.Errorf("unable to draw text: %w", err)
			}
		}
	}

	return nil
}

func writeWebsiteName(logo *image.RGBA, parsedFont *truetype.Font) error {
	fontColor := color.RGBA{239, 239, 239, 255}
	fontSize := float64(24)

	freeTypeContext := getFreeTypeContext(logo, parsedFont, fontSize, fontColor)

	pt := freetype.Pt(logo.Bounds().Dx()-270, 404)
	_, err := freeTypeContext.DrawString("DustinSpecker.com", pt)
	if err != nil {
		return fmt.Errorf("unable to draw text: %w", err)
	}

	return nil
}

func getFreeTypeContext(logo *image.RGBA, parsedFont *truetype.Font, fontSize float64, fontColor color.RGBA) *freetype.Context {
	freeTypeContext := freetype.NewContext()
	freeTypeContext.SetDPI(72)
	freeTypeContext.SetFont(parsedFont)
	freeTypeContext.SetFontSize(fontSize)
	freeTypeContext.SetClip(logo.Bounds())
	freeTypeContext.SetDst(logo)
	freeTypeContext.SetSrc(image.NewUniform(fontColor))
	freeTypeContext.SetHinting(font.HintingNone)

	return freeTypeContext
}
